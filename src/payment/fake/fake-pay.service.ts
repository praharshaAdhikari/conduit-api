import { randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { invalid, notFound } from '../../common/api-error';
import { fakePaySettings } from '../../config/env';
import type { CheckoutRequest, Recurring } from '../payment-provider';
import {
  FakeCheckout,
  FakeEvent,
  FakeEventPayload,
  FakePayment,
  FakeSubscription,
} from './fake-pay.entity';
import { FAKE_SIGNATURE_HEADER, sign } from './fake-signature';

// How the webhook for an action is delivered. Real providers deliver late,
// twice, or (when your server was down) not until they retry; these let a
// tester produce each case on demand.
export const DELIVERIES = ['now', 'later', 'twice', 'never'] as const;
export type Delivery = (typeof DELIVERIES)[number];
export const LATER_MS = 5000;

const newId = (prefix: string) =>
  `${prefix}_${randomBytes(12).toString('hex')}`;

/** The end of the billing period that starts at `from`. */
export function periodEnd(from: Date, recurring: Recurring): Date {
  const end = new Date(from);
  if (recurring === 'month') end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCFullYear(end.getUTCFullYear() + 1);
  return end;
}

@Injectable()
export class FakePayService {
  private readonly logger = new Logger('FakePay');

  constructor(
    @InjectRepository(FakeCheckout)
    private readonly checkouts: Repository<FakeCheckout>,
    @InjectRepository(FakeSubscription)
    private readonly subscriptions: Repository<FakeSubscription>,
    @InjectRepository(FakePayment)
    private readonly payments: Repository<FakePayment>,
    @InjectRepository(FakeEvent)
    private readonly events: Repository<FakeEvent>,
  ) {}

  createCheckout(request: CheckoutRequest): Promise<FakeCheckout> {
    return this.checkouts.save(
      this.checkouts.create({
        id: newId('fcs'),
        reference: request.reference,
        amountCents: request.amountCents,
        currency: request.currency,
        description: request.description,
        customerEmail: request.customerEmail,
        recurring: request.recurring,
        successUrl: request.successUrl,
        cancelUrl: request.cancelUrl,
        status: 'open',
        subscriptionId: null,
        paymentId: null,
        createdAt: new Date(),
      }),
    );
  }

  async getCheckout(id: string): Promise<FakeCheckout> {
    const checkout = await this.checkouts.findOneBy({ id });
    if (!checkout) throw notFound('checkout');
    return checkout;
  }

  /** Takes the payment for an open checkout and starts its subscription, if it has one. */
  async pay(
    id: string,
    delivery: Delivery,
  ): Promise<{ checkout: FakeCheckout; event: FakeEventPayload }> {
    const checkout = await this.getCheckout(id);
    if (checkout.status !== 'open') {
      throw invalid({ checkout: [`is ${checkout.status}`] });
    }
    const now = new Date();

    let subscription: FakeSubscription | null = null;
    if (checkout.recurring) {
      subscription = await this.subscriptions.save(
        this.subscriptions.create({
          id: newId('fsub'),
          reference: checkout.reference,
          amountCents: checkout.amountCents,
          recurring: checkout.recurring,
          status: 'active',
          currentPeriodEnd: periodEnd(now, checkout.recurring),
          cancelAtPeriodEnd: false,
          createdAt: now,
        }),
      );
    }
    const payment = await this.charge(
      checkout.amountCents,
      subscription?.id ?? null,
    );

    checkout.status = 'paid';
    checkout.subscriptionId = subscription?.id ?? null;
    checkout.paymentId = payment.id;
    await this.checkouts.save(checkout);

    const event = await this.emit(
      'checkout.completed',
      {
        reference: checkout.reference,
        checkoutId: checkout.id,
        subscriptionId: checkout.subscriptionId,
        paymentId: payment.id,
        amountCents: checkout.amountCents,
        periodEnd: subscription?.currentPeriodEnd.toISOString() ?? null,
      },
      delivery,
    );
    return { checkout, event };
  }

  async expireCheckout(id: string): Promise<void> {
    const checkout = await this.checkouts.findOneBy({ id });
    if (!checkout || checkout.status !== 'open') return;
    checkout.status = 'expired';
    await this.checkouts.save(checkout);
    await this.emit(
      'checkout.expired',
      { reference: checkout.reference, checkoutId: checkout.id },
      'soon',
    );
  }

  listCheckouts(): Promise<FakeCheckout[]> {
    return this.checkouts.find({ order: { createdAt: 'DESC' }, take: 50 });
  }

  listSubscriptions(): Promise<FakeSubscription[]> {
    return this.subscriptions.find({ order: { createdAt: 'DESC' }, take: 50 });
  }

  listEvents(): Promise<FakeEvent[]> {
    return this.events.find({ order: { createdAt: 'DESC' }, take: 50 });
  }

  findSubscription(id: string): Promise<FakeSubscription | null> {
    return this.subscriptions.findOneBy({ id });
  }

  /** The next period is paid for: the subscription runs one period longer. */
  async renew(id: string, delivery: Delivery): Promise<FakeSubscription> {
    const subscription = await this.getLiveSubscription(id);
    if (subscription.cancelAtPeriodEnd) {
      throw invalid({ subscription: ['is set to end and cannot renew'] });
    }
    const payment = await this.charge(
      subscription.amountCents,
      subscription.id,
    );
    subscription.status = 'active';
    subscription.currentPeriodEnd = periodEnd(
      subscription.currentPeriodEnd,
      subscription.recurring,
    );
    await this.subscriptions.save(subscription);

    await this.emit(
      'subscription.renewed',
      {
        subscriptionId: subscription.id,
        paymentId: payment.id,
        amountCents: subscription.amountCents,
        periodEnd: subscription.currentPeriodEnd.toISOString(),
      },
      delivery,
    );
    return subscription;
  }

  /** The renewal payment was declined; the provider will keep trying for a while. */
  async failRenewal(id: string, delivery: Delivery): Promise<FakeSubscription> {
    const subscription = await this.getLiveSubscription(id);
    subscription.status = 'past_due';
    await this.subscriptions.save(subscription);
    await this.emit(
      'subscription.payment_failed',
      { subscriptionId: subscription.id },
      delivery,
    );
    return subscription;
  }

  /** The subscription is over: its period ran out after a cancellation, or the provider gave up collecting. */
  async end(
    id: string,
    delivery: Delivery | 'soon',
  ): Promise<FakeSubscription> {
    const subscription = await this.getLiveSubscription(id);
    subscription.status = 'ended';
    await this.subscriptions.save(subscription);
    await this.emit(
      'subscription.ended',
      { subscriptionId: subscription.id },
      delivery,
    );
    return subscription;
  }

  async setCancelAtPeriodEnd(id: string, cancel: boolean): Promise<void> {
    const subscription = await this.getLiveSubscription(id);
    subscription.cancelAtPeriodEnd = cancel;
    await this.subscriptions.save(subscription);
    await this.emit(
      'subscription.updated',
      {
        subscriptionId: subscription.id,
        cancelAtPeriodEnd: cancel,
        periodEnd: subscription.currentPeriodEnd.toISOString(),
      },
      'soon',
    );
  }

  async refund(paymentId: string): Promise<void> {
    const payment = await this.payments.findOneBy({ id: paymentId });
    if (!payment) throw notFound('payment');
    if (payment.refundedAt !== null) {
      throw invalid({ payment: ['is already refunded'] });
    }
    payment.refundedAt = new Date();
    await this.payments.save(payment);
    await this.emit('payment.refunded', { paymentId: payment.id }, 'soon');
  }

  /** Sends an event again, exactly as it was sent the first time. */
  async resend(eventId: string): Promise<FakeEvent> {
    const event = await this.events.findOneBy({ id: eventId });
    if (!event) throw notFound('event');
    await this.deliver(event.payload);
    return this.events.findOneByOrFail({ id: eventId });
  }

  private async getLiveSubscription(id: string): Promise<FakeSubscription> {
    const subscription = await this.subscriptions.findOneBy({ id });
    if (!subscription) throw notFound('subscription');
    if (subscription.status === 'ended') {
      throw invalid({ subscription: ['has ended'] });
    }
    return subscription;
  }

  private charge(
    amountCents: number,
    subscriptionId: string | null,
  ): Promise<FakePayment> {
    return this.payments.save(
      this.payments.create({
        id: newId('fpay'),
        amountCents,
        subscriptionId,
        refundedAt: null,
        createdAt: new Date(),
      }),
    );
  }

  /**
   * Records an event and delivers it. 'now' waits for the API to answer, so
   * the caller sees the result; 'soon' and 'later' deliver in the background,
   * as a real provider does.
   */
  private async emit(
    type: string,
    data: FakeEventPayload['data'],
    delivery: Delivery | 'soon',
  ): Promise<FakeEventPayload> {
    const now = new Date();
    const payload: FakeEventPayload = {
      id: newId('fevt'),
      type,
      created: now.toISOString(),
      data,
    };
    await this.events.insert({
      id: payload.id,
      type,
      payload,
      deliveries: 0,
      createdAt: now,
    });

    const inBackground = (delayMs: number) => {
      setTimeout(() => void this.deliver(payload), delayMs).unref();
    };
    if (delivery === 'now') await this.deliver(payload);
    if (delivery === 'twice') {
      await this.deliver(payload);
      await this.deliver(payload);
    }
    if (delivery === 'soon') inBackground(0);
    if (delivery === 'later') inBackground(LATER_MS);
    return payload;
  }

  private async deliver(payload: FakeEventPayload): Promise<void> {
    const { webhookSecret, webhookUrl } = fakePaySettings();
    const body = JSON.stringify(payload);
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [FAKE_SIGNATURE_HEADER]: sign(webhookSecret, body, new Date()),
        },
        body,
      });
      await this.events.increment({ id: payload.id }, 'deliveries', 1);
      if (!response.ok) {
        this.logger.warn(
          `${payload.type} ${payload.id} was answered with ${response.status}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `${payload.type} ${payload.id} could not be delivered: ${String(error)}`,
      );
    }
  }
}
