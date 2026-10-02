import { createHmac, timingSafeEqual } from 'node:crypto';

// The fake provider signs its webhooks the way Stripe does: the header carries
// a timestamp and an HMAC-SHA256 of "<timestamp>.<body>", so a body that was
// changed, or an old delivery that is replayed, is rejected.

export const FAKE_SIGNATURE_HEADER = 'x-fake-pay-signature';
export const SIGNATURE_TOLERANCE_SECONDS = 300;

function digest(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
}

export function sign(secret: string, body: string, now: Date): string {
  const timestamp = Math.floor(now.getTime() / 1000);
  return `t=${timestamp},v1=${digest(secret, timestamp, body)}`;
}

/** Whether `header` is a signature of `body` made with `secret` within the last five minutes. */
export function verify(
  secret: string,
  body: string,
  header: string | undefined,
  now: Date,
): boolean {
  const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header ?? '');
  if (!match) return false;

  const timestamp = Number(match[1]);
  const age = Math.abs(now.getTime() / 1000 - timestamp);
  if (age > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = Buffer.from(digest(secret, timestamp, body), 'hex');
  const given = Buffer.from(match[2], 'hex');
  return timingSafeEqual(expected, given);
}
