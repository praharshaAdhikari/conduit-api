import type { Recurring } from '../payment/payment-provider';

export interface Plan {
  id: 'monthly' | 'yearly';
  name: string;
  amountCents: number;
  currency: string;
  interval: Recurring;
}

export const PLANS: Plan[] = [
  {
    id: 'monthly',
    name: 'Monthly',
    amountCents: 500,
    currency: 'usd',
    interval: 'month',
  },
  {
    id: 'yearly',
    name: 'Yearly',
    amountCents: 5000,
    currency: 'usd',
    interval: 'year',
  },
];

export const PLAN_IDS = PLANS.map((plan) => plan.id);

export function planById(id: string): Plan | undefined {
  return PLANS.find((plan) => plan.id === id);
}
