// The rules for how a membership moves between statuses, with no database or
// provider in sight: the current state and what happened go in, the new state
// comes out.
//
//   pending    a checkout was started and is not paid yet
//   active     paid; the member has access
//   past_due   a renewal payment failed; the member keeps access for now
//   cancelled  ended because the member cancelled, or the payment was refunded
//   lapsed     ended because a renewal was never paid

export const MEMBERSHIP_STATUSES = [
  'pending',
  'active',
  'past_due',
  'cancelled',
  'lapsed',
] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export interface MembershipState {
  status: MembershipStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
}

export type MembershipChange =
  /** A first payment or a renewal went through. */
  | { type: 'paid'; periodEnd: Date | null }
  | { type: 'payment_failed' }
  /** The member asked to stop at the end of the period, or took that back. */
  | { type: 'cancel_at_period_end'; value: boolean; periodEnd?: Date | null }
  /** The provider ended the subscription. */
  | { type: 'ended' }
  | { type: 'refunded' };

export function hasAccess(status: MembershipStatus): boolean {
  return status === 'active' || status === 'past_due';
}

/** The state after `change`. A change that does not apply returns the state as it was. */
export function applyChange(
  state: MembershipState,
  change: MembershipChange,
  now: Date,
): MembershipState {
  const live = hasAccess(state.status);

  switch (change.type) {
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
    case 'ended':
      return live
        ? {
            ...state,
            status: state.cancelAtPeriodEnd ? 'cancelled' : 'lapsed',
            cancelAtPeriodEnd: false,
            endedAt: now,
          }
        : state;
    case 'refunded':
      return live
        ? {
            ...state,
            status: 'cancelled',
            cancelAtPeriodEnd: false,
            endedAt: now,
          }
        : state;
  }
}
