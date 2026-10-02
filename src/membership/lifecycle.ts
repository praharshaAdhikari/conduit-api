// The rules for how a membership moves between statuses, with no database or
// provider in sight: the current state and what happened go in, the new state
// comes out.
//
//   pending    a checkout was started and is not paid yet
//   active     paid; the member has access
//   past_due   a renewal payment failed; access continues for a grace period
//   cancelled  ended because the member cancelled, or the payment was refunded
//   lapsed     ended because a payment was never made

export const MEMBERSHIP_STATUSES = [
  'pending',
  'active',
  'past_due',
  'cancelled',
  'lapsed',
] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** How long after the end of the paid period a past-due member keeps access. */
export const GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface MembershipState {
  status: MembershipStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
}

export type MembershipChange =
  /** The user was sent to the payment provider. */
  | { type: 'checkout_started' }
  /** That checkout was never paid. */
  | { type: 'checkout_abandoned' }
  /** A first payment or a renewal went through. */
  | { type: 'paid'; periodEnd: Date | null }
  | { type: 'payment_failed' }
  /** The member asked to stop at the end of the period, or took that back. */
  | { type: 'cancel_at_period_end'; value: boolean; periodEnd?: Date | null }
  /** The provider's end of the period differs from ours. */
  | { type: 'period_synced'; periodEnd: Date }
  /** The provider ended the subscription. */
  | { type: 'ended' }
  /** A past-due membership ran out of grace. */
  | { type: 'grace_ended' }
  | { type: 'refunded' };

/** Whether there is a subscription running at the provider: active or past due. */
export function isLive(status: MembershipStatus): boolean {
  return status === 'active' || status === 'past_due';
}

/** When a past-due membership stops giving access; null for any other status. */
export function graceEndsAt(
  state: Pick<MembershipState, 'status' | 'currentPeriodEnd'>,
): Date | null {
  if (state.status !== 'past_due' || state.currentPeriodEnd === null) {
    return null;
  }
  return new Date(state.currentPeriodEnd.getTime() + GRACE_DAYS * DAY_MS);
}

/** Whether members-only articles are open to this member at `now`. */
export function hasAccess(
  state: Pick<MembershipState, 'status' | 'currentPeriodEnd'>,
  now: Date,
): boolean {
  if (state.status === 'active') return true;
  const graceEnd = graceEndsAt(state);
  return graceEnd !== null && now.getTime() < graceEnd.getTime();
}

/** The state after `change`. A change that does not apply returns the state as it was. */
export function applyChange(
  state: MembershipState,
  change: MembershipChange,
  now: Date,
): MembershipState {
  const live = isLive(state.status);
  const end = (status: MembershipStatus): MembershipState => ({
    ...state,
    status,
    cancelAtPeriodEnd: false,
    endedAt: now,
  });

  switch (change.type) {
    case 'checkout_started':
      return live ? state : { ...state, status: 'pending' };
    case 'checkout_abandoned':
      return state.status === 'pending'
        ? { ...state, status: 'lapsed' }
        : state;
    case 'paid':
      return {
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: change.periodEnd,
        // A renewal continues the membership; anything else starts a new one.
        startedAt: live ? state.startedAt : now,
        endedAt: null,
      };
    case 'payment_failed':
      return state.status === 'active'
        ? { ...state, status: 'past_due' }
        : state;
    case 'cancel_at_period_end':
      return live
        ? {
            ...state,
            cancelAtPeriodEnd: change.value,
            currentPeriodEnd: change.periodEnd ?? state.currentPeriodEnd,
          }
        : state;
    case 'period_synced':
      return live ? { ...state, currentPeriodEnd: change.periodEnd } : state;
    case 'ended':
      if (!live) return state;
      return end(state.cancelAtPeriodEnd ? 'cancelled' : 'lapsed');
    case 'grace_ended':
      return state.status === 'past_due' ? end('lapsed') : state;
    case 'refunded':
      return live ? end('cancelled') : state;
  }
}

/** The name a change is recorded under in a membership's history. */
export function reasonOf(change: MembershipChange): string {
  if (change.type !== 'cancel_at_period_end') return change.type;
  return change.value ? 'cancel_requested' : 'cancel_withdrawn';
}
