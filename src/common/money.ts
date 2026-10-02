/** 500 cents of "usd" is "5.00 USD". */
export function formatMoney(amountCents: number, currency: string): string {
  return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}
