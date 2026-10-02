import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, LessThan, MoreThan, Repository } from 'typeorm';
import { ArticleService } from '../article/article.service';
import { TokenService } from '../auth/token.service';
import { ApiError, invalid, notFound } from '../common/api-error';
import { Clock } from '../common/clock';
import { formatMoney } from '../common/money';
import { PaginationQuery } from '../common/pagination.dto';
import { BLANK } from '../common/validation';
import { paymentSettings } from '../config/env';
import { MailService } from '../mail/mail.service';
import { PAYMENT_PROVIDER } from '../payment/payment-provider';
import type { PaymentProvider } from '../payment/payment-provider';
import { Payment } from '../payment/payment.entity';
import { User } from '../user/user.entity';
import { emptyToNull } from '../user/user.service';
import {
  AdminTipsQuery,
  AdminTipView,
  CreateTipDto,
  TipDirection,
  TipView,
} from './tip.dto';
import { EmailVerification, Tip } from './tip.entity';
import {
  CODE_TTL_MS,
  codeProblem,
  hashCode,
  matchesHash,
  MAX_CODES_PER_HOUR,
  newCode,
} from './verification';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RELATIONS = { author: true, article: true, tipperUser: true };
const HOUR_MS = 60 * 60 * 1000;

export interface StartedTip {
  tip: TipView;
  /** Where to pay; null while the email address still has to be confirmed. */
  checkoutUrl: string | null;
  checkoutId: string | null;
}

export function toTipView(tip: Tip): TipView {
  return {
    reference: tip.reference,
    status: tip.status,
    amountCents: tip.amountCents,
    currency: tip.currency,
    author: tip.author.username,
    article: tip.article?.slug ?? null,
    name: tip.tipperName,
    message: tip.message,
    createdAt: tip.createdAt,
    paidAt: tip.paidAt,
  };
}

@Injectable()
export class TipService {
  private readonly logger = new Logger(TipService.name);

  constructor(
    @InjectRepository(Tip) private readonly tips: Repository<Tip>,
    @InjectRepository(EmailVerification)
    private readonly verifications: Repository<EmailVerification>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly articles: ArticleService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly clock: Clock,
  ) {}

  /**
   * Starts a tip. A logged-in user, or a guest holding a guest token for the
   * same address, goes straight to payment. Any other guest is emailed a code
   * first.
   */
  async create(
    dto: CreateTipDto,
    viewer: User | undefined,
    guestEmail: string | null,
  ): Promise<StartedTip> {
    const author = await this.users.findOneBy({ username: dto.author });
    if (!author) throw notFound('author');
    if (author.suspendedAt !== null) {
      throw invalid({ author: ['cannot receive tips'] });
    }

    const email = viewer ? viewer.email : dto.email;
    if (!email) throw invalid({ email: [BLANK] });
    const sameAddress = (other: string) =>
      other.toLowerCase() === email.toLowerCase();
    if (viewer?.id === author.id || sameAddress(author.email)) {
      throw invalid({ tip: ["can't tip yourself"] });
    }

    const article = dto.article
      ? await this.articles.getVisible(dto.article, viewer?.id)
      : null;
    if (article && article.authorId !== author.id) {
      throw invalid({ article: ['is not by this author'] });
    }

    const trusted =
      viewer !== undefined || (guestEmail !== null && sameAddress(guestEmail));
    if (!trusted) await this.assertMaySendCode(email);

    const now = this.clock.now();
    const { id } = await this.tips.save(
      this.tips.create({
        reference: randomUUID(),
        authorId: author.id,
        articleId: article?.id ?? null,
        tipperUserId: viewer?.id ?? null,
        tipperEmail: email,
        tipperName: emptyToNull(dto.name ?? null),
        message: emptyToNull(dto.message ?? null),
        amountCents: dto.amountCents,
        currency: 'usd',
        status: trusted ? 'pending_payment' : 'pending_verification',
        paidAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const tip = await this.tips.findOneOrFail({
      where: { id },
      relations: RELATIONS,
    });

    if (trusted) return this.startPayment(tip);
    await this.sendCode(tip);
    return { tip: toTipView(tip), checkoutUrl: null, checkoutId: null };
  }

  async get(reference: string): Promise<TipView> {
    return toTipView(await this.getByReference(reference));
  }

  /** Checks the emailed code. If it is right, the tip can be paid and the guest gets a guest token. */
  async verify(
    reference: string,
    code: string,
  ): Promise<StartedTip & { guestToken: string }> {
    const tip = await this.getAwaitingCode(reference);
    const verification = await this.latestVerification(tip.id);
    const problem = verification
      ? codeProblem(verification, this.clock.now())
      : 'has expired; ask for a new one';
    if (!verification || problem) throw invalid({ code: [problem!] });

    if (!matchesHash(tip.reference, code, verification.codeHash)) {
      await this.verifications.increment(
        { id: verification.id },
        'attempts',
        1,
      );
      throw invalid({ code: ['is wrong'] });
    }

    const now = this.clock.now();
    await this.verifications.update(verification.id, { usedAt: now });
    tip.status = 'pending_payment';
    await this.tips.update(tip.id, {
      status: 'pending_payment',
      updatedAt: now,
    });

    return {
      ...(await this.startPayment(tip)),
      guestToken: this.tokens.signGuest(tip.tipperEmail),
    };
  }

  /** Emails a new code; the earlier ones stop working. */
  async resend(reference: string): Promise<TipView> {
    const tip = await this.getAwaitingCode(reference);
    await this.assertMaySendCode(tip.tipperEmail);
    await this.sendCode(tip);
    return toTipView(tip);
  }

  /** Tips the user was paid, or tips the user started, newest first. */
  async listForUser(
    userId: number,
    direction: TipDirection,
    { limit, offset }: PaginationQuery,
  ) {
    const [rows, tipsCount] = await this.tips.findAndCount({
      where:
        direction === 'received'
          ? { authorId: userId, status: In(['paid', 'refunded']) }
          : { tipperUserId: userId },
      relations: RELATIONS,
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { tips: rows.map(toTipView), tipsCount };
  }

  async adminList({ status, limit, offset }: AdminTipsQuery) {
    const [rows, tipsCount] = await this.tips.findAndCount({
      where: status ? { status } : {},
      relations: RELATIONS,
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit,
      skip: offset,
    });
    const tips = rows.map((tip): AdminTipView => ({
      ...toTipView(tip),
      tipperEmail: tip.tipperEmail,
      tipperUsername: tip.tipperUser?.username ?? null,
    }));
    return { tips, tipsCount };
  }

  // The three below are called while a webhook event or a refund is being
  // applied, inside that transaction.

  async markPaid(manager: EntityManager, tipId: number): Promise<void> {
    const now = this.clock.now();
    await manager.update(Tip, tipId, {
      status: 'paid',
      paidAt: now,
      updatedAt: now,
    });
  }

  async markExpired(manager: EntityManager, tipId: number): Promise<void> {
    await manager.update(
      Tip,
      { id: tipId, status: In(['pending_verification', 'pending_payment']) },
      { status: 'expired', updatedAt: this.clock.now() },
    );
  }

  async markRefunded(manager: EntityManager, tipId: number): Promise<void> {
    await manager.update(Tip, tipId, {
      status: 'refunded',
      updatedAt: this.clock.now(),
    });
  }

  /** Closes guest tips that have waited for their code since before `cutoff`; returns how many. */
  async expireUnconfirmed(cutoff: Date): Promise<number> {
    const result = await this.tips.update(
      { status: 'pending_verification', createdAt: LessThan(cutoff) },
      { status: 'expired', updatedAt: this.clock.now() },
    );
    return result.affected ?? 0;
  }

  /** Tells the tipper their payment arrived and the author that they were tipped. */
  async sendReceipts(tipId: number): Promise<void> {
    const tip = await this.tips.findOne({
      where: { id: tipId },
      relations: RELATIONS,
    });
    if (!tip) return;
    const amount = formatMoney(tip.amountCents, tip.currency);
    const on = tip.article ? ` for "${tip.article.title}"` : '';

    await this.mail.sendQuietly({
      to: tip.tipperEmail,
      subject: `Your tip to ${tip.author.username}`,
      text: `Thank you. Your tip of ${amount} to ${tip.author.username}${on} was received.\n\nReference: ${tip.reference}`,
    });
    await this.mail.sendQuietly({
      to: tip.author.email,
      subject: 'You received a tip',
      text:
        `${tip.tipperName ?? 'Someone'} sent you ${amount}${on}.` +
        (tip.message ? `\n\n"${tip.message}"` : ''),
    });
  }

  private async startPayment(tip: Tip): Promise<StartedTip> {
    const now = this.clock.now();
    const payment = await this.payments.save(
      this.payments.create({
        reference: randomUUID(),
        kind: 'tip',
        userId: tip.tipperUserId,
        membershipId: null,
        tipId: tip.id,
        amountCents: tip.amountCents,
        currency: tip.currency,
        description: `Tip for ${tip.author.username}`,
        status: 'pending',
        provider: this.provider.name,
        providerCheckoutId: null,
        providerPaymentId: null,
        paidAt: null,
        refundedAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    );

    // The provider sends the tipper back to the tip's own page either way.
    const page = `${paymentSettings().webUrl}/tips/${tip.reference}`;
    try {
      const checkout = await this.provider.createCheckout({
        reference: payment.reference,
        amountCents: payment.amountCents,
        currency: payment.currency,
        description: payment.description,
        customerEmail: tip.tipperEmail,
        recurring: null,
        successUrl: page,
        cancelUrl: `${page}?left=1`,
      });
      await this.payments.update(payment.id, {
        providerCheckoutId: checkout.id,
      });
      return {
        tip: toTipView(tip),
        checkoutUrl: checkout.url,
        checkoutId: checkout.id,
      };
    } catch (error) {
      await this.payments.update(payment.id, { status: 'expired' });
      throw error;
    }
  }

  private async sendCode(tip: Tip): Promise<void> {
    const code = newCode();
    const now = this.clock.now();
    await this.verifications.insert({
      tipId: tip.id,
      email: tip.tipperEmail,
      codeHash: hashCode(tip.reference, code),
      attempts: 0,
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      usedAt: null,
      createdAt: now,
    });

    try {
      await this.mail.send({
        to: tip.tipperEmail,
        subject: 'Confirm your email to send your tip',
        text:
          `Your code is ${code}. It works for ${CODE_TTL_MS / 60_000} minutes.\n\n` +
          `Enter it to send your tip of ${formatMoney(tip.amountCents, tip.currency)} to ${tip.author.username}. ` +
          'If you did not ask for this, ignore this message: nothing is charged without the code.',
      });
    } catch (error) {
      this.logger.warn(`A code could not be emailed: ${String(error)}`);
      throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, {
        email: ['could not be sent; try again'],
      });
    }
  }

  /** Stops one address being flooded with codes, whoever is asking for them. */
  private async assertMaySendCode(email: string): Promise<void> {
    const recent = await this.verifications.countBy({
      email,
      createdAt: MoreThan(new Date(this.clock.now().getTime() - HOUR_MS)),
    });
    if (recent >= MAX_CODES_PER_HOUR) {
      throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, {
        email: ['has been sent too many codes; try again in an hour'],
      });
    }
  }

  private latestVerification(tipId: number): Promise<EmailVerification | null> {
    return this.verifications.findOne({
      where: { tipId },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  private async getByReference(reference: string): Promise<Tip> {
    const tip = UUID.test(reference)
      ? await this.tips.findOne({ where: { reference }, relations: RELATIONS })
      : null;
    if (!tip) throw notFound('tip');
    return tip;
  }

  private async getAwaitingCode(reference: string): Promise<Tip> {
    const tip = await this.getByReference(reference);
    if (tip.status !== 'pending_verification') {
      throw invalid({ tip: ['is not waiting for a code'] });
    }
    return tip;
  }
}
