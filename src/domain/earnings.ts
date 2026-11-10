/**
 * Earnings & Payouts (T22): pure sums over the expert's own ledger lines. Calendar buckets use Nairobi
 * time, which is UTC+3 all year.
 */

export type SeriesView = "week" | "month" | "year";
export const SERIES_VIEWS: [SeriesView, string][] = [
  ["month", "Month"],
  ["week", "Week"],
  ["year", "Year"],
];

/** A credit to the expert: what they earned from one lesson, after the fee and tax. */
export type Credit = { id: string; amount_kes: number; posted_at: string; booking_id: string | null; commission_rate: number | null };
export type Point = { key: string; label: string; value: number };

const EAT_MS = 3 * 3600_000;
const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The Nairobi calendar date of an instant, as a UTC date object (use the getUTC* readers on it). */
const eat = (d: Date | string) => new Date((typeof d === "string" ? new Date(d) : d).getTime() + EAT_MS);

/** Which bucket an instant falls in: 2026, 2026-11, or the Monday that starts its week (2026-11-09). */
export function bucketOf(view: SeriesView, at: Date | string): string {
  const d = eat(at);
  if (view === "year") return String(d.getUTCFullYear());
  if (view === "month") return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
}

/** The buckets a chart shows, oldest first: six months, eight weeks or three years, ending now. */
export function buckets(view: SeriesView, now: Date): { key: string; label: string }[] {
  const d = eat(now);
  const out: { key: string; label: string }[] = [];
  if (view === "year") {
    for (let i = 2; i >= 0; i--) out.push({ key: String(d.getUTCFullYear() - i), label: String(d.getUTCFullYear() - i) });
  } else if (view === "month") {
    for (let i = 5; i >= 0; i--) {
      const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
      out.push({ key: `${m.getUTCFullYear()}-${pad(m.getUTCMonth() + 1)}`, label: MONTHS[m.getUTCMonth()] });
    }
  } else {
    const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    for (let i = 7; i >= 0; i--) {
      const w = new Date(monday - i * 7 * 86_400_000);
      out.push({ key: `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`, label: `${w.getUTCDate()} ${MONTHS[w.getUTCMonth()]}` });
    }
  }
  return out;
}

/** Earnings per bucket; buckets with nothing are zero, not missing. */
export function series(view: SeriesView, credits: Credit[], now: Date): Point[] {
  const sums = new Map<string, number>();
  for (const c of credits) {
    const k = bucketOf(view, c.posted_at);
    sums.set(k, (sums.get(k) ?? 0) + c.amount_kes);
  }
  return buckets(view, now).map((b) => ({ ...b, value: sums.get(b.key) ?? 0 }));
}

/** Percent change from one period to the next, or null when there is nothing to compare with. */
export function change(current: number, previous: number): number | null {
  return previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
}

export type Breakdown = { net_kes: number; fee_kes: number; withholding_kes: number; gross_kes: number };

/**
 * Where what learners paid went: the expert, Koobi's fee, and withholding tax. The ledger shows the
 * expert their own two lines; the fee is worked back from the rate stored on each line, so it can be
 * a shilling out per lesson from rounding.
 */
export function breakdown(credits: Credit[], withholdingByBooking: Map<string, number>): Breakdown {
  let net = 0;
  let fee = 0;
  let wht = 0;
  const seen = new Set<string>();
  for (const c of credits) {
    net += c.amount_kes;
    let w = 0;
    if (c.booking_id && !seen.has(c.booking_id)) {
      seen.add(c.booking_id);
      w = withholdingByBooking.get(c.booking_id) ?? 0;
    }
    wht += w;
    const rate = c.commission_rate ?? 0;
    if (rate > 0 && rate < 1) fee += Math.round((c.amount_kes + w) / (1 - rate)) - (c.amount_kes + w);
  }
  return { net_kes: net, fee_kes: fee, withholding_kes: wht, gross_kes: net + fee + wht };
}

/** A round number at or above the largest value, for the top of the chart's scale. */
export function niceMax(max: number): number {
  if (max <= 0) return 1000;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= max) return m * pow;
  return 10 * pow;
}

/** 1,500 → 1.5k, 20,000 → 20k, for axis ticks only. */
export function shortKES(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}k`;
  return String(n);
}
