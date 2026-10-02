// What the API needs from a payment provider. There are two implementations:
// Stripe, and a fake one that runs inside this API so the system works with no
// account and no network. PAYMENT_PROVIDER picks one.

export type ProviderName = 'fake' | 'stripe';
export type Recurring = 'month' | 'year';

export interface CheckoutRequest {
  /** Our id for this payment; the provider sends it back in the webhook. */
  reference: string;
  amountCents: number;
  currency: string;
  description: string;
  customerEmail: string;
  /** Set for a subscription that renews; null for a single payment. */
  recurring: Recurring | null;
  successUrl: string;
  cancelUrl: string;
}

export interface Checkout {
  id: string;
  /** Where to send the customer to pay. */
  url: string;
}

export interface ProviderSubscription {
  id: string;
  status: 'active' | 'past_due' | 'ended';
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

interface EventBase {
  /** The provider's id for the event; the same on every delivery of it. */
  id: string;
  /** The provider's own name for the event, kept for the record. */
  name: string;
}

// What a webhook can tell us, in terms that do not depend on the provider.
export type PaymentEvent = EventBase &
  (
    | {
        type: 'checkout.completed';
        reference: string;
        subscriptionId: string | null;
        paymentId: string | null;
        periodEnd: Date | null;
      }
    | { type: 'checkout.expired'; reference: string }
    | {
        type: 'subscription.renewed';
        subscriptionId: string;
        paymentId: string | null;
        amountCents: number;
        periodEnd: Date;
      }
    | { type: 'subscription.payment_failed'; subscriptionId: string }
    | {
        type: 'subscription.updated';
        subscriptionId: string;
        cancelAtPeriodEnd: boolean;
        periodEnd: Date | null;
      }
    | { type: 'subscription.ended'; subscriptionId: string }
    | { type: 'payment.refunded'; paymentId: string }
    | { type: 'ignored' }
  );

export type WebhookHeaders = Record<string, string | string[] | undefined>;

export interface PaymentProvider {
  readonly name: ProviderName;

  createCheckout(request: CheckoutRequest): Promise<Checkout>;

  /** Closes a checkout nobody has paid, so it cannot be paid later. */
  expireCheckout(checkoutId: string): Promise<void>;

  /**
   * Checks the signature against the exact bytes received and translates the
   * event. Throws a 400 when the signature is missing or wrong.
   */
  parseWebhook(
    rawBody: Buffer | undefined,
    headers: WebhookHeaders,
  ): Promise<PaymentEvent>;

  /** The provider's own view of a subscription; null if it has none by that id. */
  getSubscription(subscriptionId: string): Promise<ProviderSubscription | null>;

  setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean): Promise<void>;

  /** Ends a subscription now, with no further charges. */
  endSubscription(subscriptionId: string): Promise<void>;

  refund(paymentId: string): Promise<void>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
