import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

// The 6-digit codes that prove a guest owns the email address they gave.

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
export const MAX_CODES_PER_HOUR = 5;

export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Tied to the tip, so a code for one tip is no use for another. */
export function hashCode(tipReference: string, code: string): string {
  return createHash('sha256').update(`${tipReference}:${code}`).digest('hex');
}

export function matchesHash(
  tipReference: string,
  code: string,
  hash: string,
): boolean {
  return timingSafeEqual(
    Buffer.from(hashCode(tipReference, code), 'hex'),
    Buffer.from(hash, 'hex'),
  );
}

export interface CodeState {
  attempts: number;
  expiresAt: Date;
  usedAt: Date | null;
}

/** Why a code cannot be tried right now, or null if it can. */
export function codeProblem(state: CodeState, now: Date): string | null {
  if (state.usedAt !== null) return 'has already been used';
  if (state.attempts >= MAX_CODE_ATTEMPTS) {
    return 'has been tried too many times; ask for a new one';
  }
  if (state.expiresAt.getTime() <= now.getTime()) {
    return 'has expired; ask for a new one';
  }
  return null;
}
