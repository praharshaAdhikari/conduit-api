import type { FakeCheckout } from './fake-pay.entity';
import { DELIVERIES, LATER_MS } from './fake-pay.service';

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  );

export function formatMoney(amountCents: number, currency: string): string {
  return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

const DELIVERY_LABELS: Record<(typeof DELIVERIES)[number], string> = {
  now: 'Straight away (before you are sent back)',
  later: `After ${LATER_MS / 1000} seconds (you arrive back first)`,
  twice: 'Twice',
  never: 'Never (the API is not told)',
};

/** The fake provider's hosted checkout: what the customer sees instead of Stripe's page. */
export function checkoutPage(
  checkout: FakeCheckout,
  declined: boolean,
): string {
  const amount = formatMoney(checkout.amountCents, checkout.currency);
  const terms = checkout.recurring
    ? `${amount} every ${checkout.recurring}`
    : `${amount}, once`;

  const body =
    checkout.status === 'open'
      ? `
      ${declined ? '<p class="error" role="alert" data-test="fake-pay-declined">The card was declined. Nothing was charged; you can try again.</p>' : ''}
      <form method="post">
        <label for="delivery">Webhook delivery (for testing)</label>
        <select id="delivery" name="delivery" data-test="fake-pay-delivery">
          ${DELIVERIES.map((delivery) => `<option value="${delivery}">${DELIVERY_LABELS[delivery]}</option>`).join('')}
        </select>
        <div class="buttons">
          <button name="outcome" value="pay" class="primary" data-test="fake-pay-pay">Pay ${escapeHtml(amount)}</button>
          <button name="outcome" value="decline" data-test="fake-pay-decline">Decline the card</button>
          <button name="outcome" value="cancel" data-test="fake-pay-cancel">Cancel and go back</button>
        </div>
      </form>`
      : `<p class="error" role="alert" data-test="fake-pay-closed">This checkout is ${checkout.status === 'paid' ? 'already paid' : 'no longer open'}.</p>
      <p><a href="${escapeHtml(checkout.cancelUrl)}">Go back</a></p>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fake Pay checkout</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f3f3f3; color: #373a3c; margin: 0; }
    main { max-width: 28rem; margin: 3rem auto; background: #fff; padding: 2rem; border-radius: .75rem; border: 1px solid #eee; }
    h1 { font-size: 1.25rem; margin: 0 0 .25rem; }
    .note { color: #818a91; font-size: .875rem; margin: 0 0 1.5rem; }
    dl { margin: 0 0 1.5rem; }
    dt { color: #818a91; font-size: .875rem; }
    dd { margin: 0 0 .75rem; font-size: 1.125rem; }
    label { display: block; color: #818a91; font-size: .875rem; margin-bottom: .25rem; }
    select { width: 100%; padding: .5rem; margin-bottom: 1.5rem; }
    .buttons { display: grid; gap: .5rem; }
    button { padding: .75rem; border: 1px solid #ccc; border-radius: .5rem; background: #fff; font-size: 1rem; cursor: pointer; }
    button.primary { background: #33aa44; border-color: #33aa44; color: #fff; }
    .error { color: #b85c5c; font-weight: bold; }
  </style>
</head>
<body>
  <main>
    <h1>Fake Pay</h1>
    <p class="note">A stand-in for a payment provider. No card is needed and no money moves.</p>
    <dl>
      <dt>For</dt><dd data-test="fake-pay-description">${escapeHtml(checkout.description)}</dd>
      <dt>Amount</dt><dd data-test="fake-pay-amount">${escapeHtml(terms)}</dd>
      <dt>Customer</dt><dd data-test="fake-pay-email">${escapeHtml(checkout.customerEmail)}</dd>
    </dl>
    ${body}
  </main>
</body>
</html>`;
}
