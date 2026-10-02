import { HttpStatus } from '@nestjs/common';
import Stripe from 'stripe';
import { ApiError } from '../common/api-error';
import type {
  Checkout,
  CheckoutRequest,
  PaymentEvent,
  PaymentProvider,
  ProviderSubscription,
  WebhookHeaders,
} from './payment-provider';

const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === 'string' ? value : (value?.id ?? null);

const toDate = (seconds: number) => new Date(seconds * 1000);

/** A subscription's period ends when the last of its items does; ours has one item. */
function periodEndOf(subscription: Stripe.Subscription): Date {
  const ends = subscription.items.data.map((item) => item.current_period_end);
  return toDate(Math.max(...ends));
}

function paymentIntentOf(invoice: Stripe.Invoice): string | null {
  const payment = invoice.payments?.data[0]?.payment;
  return payment ? idOf(payment.payment_intent) : null;
}

function subscriptionOf(invoice: Stripe.Invoice): string | null {
  return idOf(invoice.parent?.subscription_details?.subscription);
}

// Stripe test mode. Checkout uses inline prices, so nothing has to be created
// in the Stripe dashboard: the two keys in .env are the whole setup.
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe';
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
  ) {
    this.stripe = new Stripe(secretKey);
  }

  async createCheckout(request: CheckoutRequest): Promise<Checkout> {
    const { recurring, reference } = request;
    const session = await this.stripe.checkout.sessions.create({
      mode: recurring ? 'subscription' : 'payment',
      client_reference_id: reference,
      customer_email: request.customerEmail,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: request.currency,
            unit_amount: request.amountCents,
            product_data: { name: request.description },
            ...(recurring ? { recurring: { interval: recurring } } : {}),
          },
        },
      ],
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
    });
    if (!session.url) throw new Error('Stripe returned a checkout with no URL');
    return { id: session.id, url: session.url };
  }

  async expireCheckout(checkoutId: string): Promise<void> {
    const session = await this.stripe.checkout.sessions.retrieve(checkoutId);
    if (session.status === 'open') {
      await this.stripe.checkout.sessions.expire(checkoutId);
    }
  }

  async parseWebhook(
    rawBody: Buffer | undefined,
    headers: WebhookHeaders,
  ): Promise<PaymentEvent> {
    const signature = headers['stripe-signature'];
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody ?? '',
        Array.isArray(signature) ? signature[0] : (signature ?? ''),
        this.webhookSecret,
      );
    } catch {
      throw new ApiError(HttpStatus.BAD_REQUEST, {
        signature: ['is missing or invalid'],
      });
    }
    return this.translate(event);
  }

  private async translate(event: Stripe.Event): Promise<PaymentEvent> {
    const base = { id: event.id, name: event.type };
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const reference = session.client_reference_id;
        if (!reference) return { ...base, type: 'ignored' };

        const subscriptionId = idOf(session.subscription);
        if (!subscriptionId) {
          return {
            ...base,
            type: 'checkout.completed',
            reference,
            subscriptionId: null,
            paymentId: idOf(session.payment_intent),
            periodEnd: null,
          };
        }
        // The session does not say when the first period ends or which
        // payment paid for it; the subscription and its invoice do.
        const subscription = await this.stripe.subscriptions.retrieve(
          subscriptionId,
          { expand: ['latest_invoice.payments'] },
        );
        const invoice = subscription.latest_invoice;
        return {
          ...base,
          type: 'checkout.completed',
          reference,
          subscriptionId,
          paymentId:
            invoice && typeof invoice !== 'string'
              ? paymentIntentOf(invoice)
              : null,
          periodEnd: periodEndOf(subscription),
        };
      }
      case 'checkout.session.expired': {
        const reference = event.data.object.client_reference_id;
        return reference
          ? { ...base, type: 'checkout.expired', reference }
          : { ...base, type: 'ignored' };
      }
      case 'invoice.paid': {
        // The first invoice is covered by checkout.session.completed.
        const subscriptionId = subscriptionOf(event.data.object);
        if (
          event.data.object.billing_reason !== 'subscription_cycle' ||
          !subscriptionId
        ) {
          return { ...base, type: 'ignored' };
        }
        const [invoice, subscription] = await Promise.all([
          this.stripe.invoices.retrieve(event.data.object.id, {
            expand: ['payments'],
          }),
          this.stripe.subscriptions.retrieve(subscriptionId),
        ]);
        return {
          ...base,
          type: 'subscription.renewed',
          subscriptionId,
          paymentId: paymentIntentOf(invoice),
          amountCents: invoice.amount_paid,
          periodEnd: periodEndOf(subscription),
        };
      }
      case 'invoice.payment_failed': {
        const subscriptionId = subscriptionOf(event.data.object);
        return subscriptionId
          ? { ...base, type: 'subscription.payment_failed', subscriptionId }
          : { ...base, type: 'ignored' };
      }
      case 'customer.subscription.updated':
        return {
          ...base,
          type: 'subscription.updated',
          subscriptionId: event.data.object.id,
          cancelAtPeriodEnd: event.data.object.cancel_at_period_end,
          periodEnd: periodEndOf(event.data.object),
        };
      case 'customer.subscription.deleted':
        return {
          ...base,
          type: 'subscription.ended',
          subscriptionId: event.data.object.id,
        };
      case 'charge.refunded': {
        const paymentId = idOf(event.data.object.payment_intent);
        return paymentId
          ? { ...base, type: 'payment.refunded', paymentId }
          : { ...base, type: 'ignored' };
      }
      default:
        return { ...base, type: 'ignored' };
    }
  }

  async getSubscription(
    subscriptionId: string,
  ): Promise<ProviderSubscription | null> {
    let subscription: Stripe.Subscription;
    try {
      subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      if (error instanceof Stripe.errors.StripeInvalidRequestError) return null;
      throw error;
    }

    const ended = ['canceled', 'incomplete_expired', 'unpaid'];
    const pastDue = ['past_due', 'incomplete'];
    let status: ProviderSubscription['status'] = 'active';
    if (ended.includes(subscription.status)) status = 'ended';
    else if (pastDue.includes(subscription.status)) status = 'past_due';

    return {
      id: subscription.id,
      status,
      currentPeriodEnd: periodEndOf(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    };
  }

  async setCancelAtPeriodEnd(
    subscriptionId: string,
    cancel: boolean,
  ): Promise<void> {
    await this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: cancel,
    });
  }

  async endSubscription(subscriptionId: string): Promise<void> {
    await this.stripe.subscriptions.cancel(subscriptionId);
  }

  async refund(paymentId: string): Promise<void> {
    await this.stripe.refunds.create({ payment_intent: paymentId });
  }
}
