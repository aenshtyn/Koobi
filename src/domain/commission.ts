/**
 * Commission and the split of one confirmed session (PRD FR-COMM, FR-LEDGER-2).
 * Rates here are the defaults; in production the applied rate comes from the dated
 * parameters table and is stored on every ledger entry.
 */

export const DEFAULT_RATES = {
  onlineOpening: 0.2,
  onlineAfter50h: 0.15,
  onlineAfter200h: 0.12,
  inPersonFirstMonth: 0.2,
  managedPlan: 0.1,
  seat: 0.2,
  withholding: 0.05,
  vat: 0.16,
} as const;

/** Online one-to-one: rate from the pair's confirmed paid hours before this session. */
export function onlineRate(pairPaidHoursBefore: number, rates = DEFAULT_RATES): number {
  if (pairPaidHoursBefore >= 200) return rates.onlineAfter200h;
  if (pairPaidHoursBefore >= 50) return rates.onlineAfter50h;
  return rates.onlineOpening;
}

export type SessionSplit = {
  price: number;
  commission: number;
  teacherGross: number;
  withholding: number;
  teacherNet: number;
  vatOnFee: number;
};

/** Whole shillings, half up. */
const round = (n: number) => Math.round(n + Number.EPSILON);

export function splitSession(opts: {
  priceKes: number;
  rate: number;
  vatRegistered: boolean;
  withholdingRate?: number;
  vatRate?: number;
}): SessionSplit {
  const { priceKes, rate, vatRegistered } = opts;
  if (!Number.isInteger(priceKes) || priceKes <= 0) throw new Error("price must be a positive whole KES amount");
  if (rate < 0 || rate >= 1) throw new Error("rate must be in [0, 1)");
  const commission = round(priceKes * rate);
  const teacherGross = priceKes - commission;
  const withholding = round(teacherGross * (opts.withholdingRate ?? DEFAULT_RATES.withholding));
  const vatOnFee = vatRegistered ? round(commission * (opts.vatRate ?? DEFAULT_RATES.vat)) : 0;
  return { price: priceKes, commission, teacherGross, withholding, teacherNet: teacherGross - withholding, vatOnFee };
}
