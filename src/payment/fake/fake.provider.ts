import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../../common/api-error';
import { fakePaySettings, paymentSettings } from '../../config/env';
import type {
  Checkout,
  CheckoutRequest,
  PaymentEvent,
  PaymentProvider,
  ProviderSubscription,
  WebhookHeaders,
} from '../payment-provider';
import type { FakeEventPayload } from './fake-pay.entity';
import { FakePayService } from './fake-pay.service';
import { FAKE_SIGNATURE_HEADER, verify } from './fake-signature';

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const textOrNull = (value: unknown) =>
  typeof value === 'string' ? value : null;
const dateOrNull = (value: unknown) =>
  typeof value === 'string' ? new Date(value) : null;

/** Translates one of the fake provider's events. */
export function toPaymentEvent(payload: FakeEventPayload): PaymentEvent {
  const base = { id: payload.id, name: payload.type };
  const { data } = payload;
  switch (payload.type) {
    case 'checkout.completed':
      return {
        ...base,
        type: 'checkout.completed',
        reference: text(data.reference),
        subscriptionId: textOrNull(data.subscriptionId),
        paymentId: textOrNull(data.paymentId),
        periodEnd: dateOrNull(data.periodEnd),
      };
    case 'checkout.expired':
      return {
        ...base,
        type: 'checkout.expired',
        reference: text(data.reference),
      };
    case 'subscription.renewed':
      return {
        ...base,
        type: 'subscription.renewed',
        subscriptionId: text(data.subscriptionId),
        paymentId: textOrNull(data.paymentId),
        amountCents: Number(data.amountCents),
        periodEnd: new Date(text(data.periodEnd)),
      };
    case 'subscription.payment_failed':
      return {
        ...base,
        type: 'subscription.payment_failed',
        subscriptionId: text(data.subscriptionId),
      };
    case 'subscription.updated':
      return {
        ...base,
        type: 'subscription.updated',
        subscriptionId: text(data.subscriptionId),
        cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
        periodEnd: dateOrNull(data.periodEnd),
      };
    case 'subscription.ended':
      return {
        ...base,
        type: 'subscription.ended',
        subscriptionId: text(data.subscriptionId),
      };
    case 'payment.refunded':
      return {
        ...base,
        type: 'payment.refunded',
        paymentId: text(data.paymentId),
      };
    default:
      return { ...base, type: 'ignored' };
  }
}

export class FakeProvider implements PaymentProvider {
  readonly name = 'fake';

  constructor(private readonly fakePay: FakePayService) {}

  async createCheckout(request: CheckoutRequest): Promise<Checkout> {
    const { id } = await this.fakePay.createCheckout(request);
    const { apiPublicUrl } = paymentSettings();
    return { id, url: `${apiPublicUrl}/api/fake-pay/checkouts/${id}` };
  }

  expireCheckout(checkoutId: string): Promise<void> {
    return this.fakePay.expireCheckout(checkoutId);
  }

  parseWebhook(
    rawBody: Buffer | undefined,
    headers: WebhookHeaders,
  ): Promise<PaymentEvent> {
    const header = headers[FAKE_SIGNATURE_HEADER];
    const body = rawBody?.toString('utf8') ?? '';
    const signed = verify(
      fakePaySettings().webhookSecret,
      body,
      Array.isArray(header) ? header[0] : header,
      new Date(),
    );
    if (!signed) {
      throw new ApiError(HttpStatus.BAD_REQUEST, {
        signature: ['is missing or invalid'],
      });
    }
    return Promise.resolve(
      toPaymentEvent(JSON.parse(body) as FakeEventPayload),
    );
  }

  async getSubscription(
    subscriptionId: string,
  ): Promise<ProviderSubscription | null> {
    const subscription = await this.fakePay.findSubscription(subscriptionId);
    if (!subscription) return null;
    return {
      id: subscription.id,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    };
  }

  setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean): Promise<void> {
    return this.fakePay.setCancelAtPeriodEnd(subscriptionId, cancel);
  }

  async endSubscription(subscriptionId: string): Promise<void> {
    await this.fakePay.end(subscriptionId, 'soon');
  }

  refund(paymentId: string): Promise<void> {
    return this.fakePay.refund(paymentId);
  }
}
