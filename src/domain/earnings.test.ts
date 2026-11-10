import { describe, expect, it } from "vitest";
import { breakdown, bucketOf, buckets, change, niceMax, series, shortKES, type Credit } from "./earnings";

const credit = (posted_at: string, amount_kes: number, booking_id: string | null = null, commission_rate: number | null = 0.2): Credit => ({
  id: `${posted_at}-${amount_kes}`,
  amount_kes,
  posted_at,
  booking_id,
  commission_rate,
});

describe("earnings buckets (Nairobi time)", () => {
  it("puts late evening UTC into the next Nairobi day, month and year", () => {
    // 31 Dec 2026 22:30 UTC is 1 Jan 2027 01:30 in Nairobi.
    expect(bucketOf("month", "2026-12-31T22:30:00Z")).toBe("2027-01");
    expect(bucketOf("year", "2026-12-31T22:30:00Z")).toBe("2027");
  });
  it("starts weeks on Monday", () => {
    // Tuesday 10 Nov 2026 and Sunday 15 Nov 2026 both belong to the week of Monday 9 Nov.
    expect(bucketOf("week", "2026-11-10T09:00:00Z")).toBe("2026-11-09");
    expect(bucketOf("week", "2026-11-15T12:00:00Z")).toBe("2026-11-09");
    expect(bucketOf("week", "2026-11-16T00:00:00Z")).toBe("2026-11-16");
  });
  it("lists six months, eight weeks or three years ending now", () => {
    const now = new Date("2026-11-10T09:00:00Z");
    expect(buckets("month", now).map((b) => b.label)).toEqual(["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"]);
    expect(buckets("week", now)).toHaveLength(8);
    expect(buckets("week", now).at(-1)).toEqual({ key: "2026-11-09", label: "9 Nov" });
    expect(buckets("year", now).map((b) => b.key)).toEqual(["2024", "2025", "2026"]);
  });
  it("sums credits per bucket and keeps empty buckets at zero", () => {
    const now = new Date("2026-11-10T09:00:00Z");
    const points = series("month", [credit("2026-11-02T10:00:00Z", 1140), credit("2026-11-09T10:00:00Z", 760), credit("2026-09-20T10:00:00Z", 500), credit("2025-01-01T10:00:00Z", 999)], now);
    expect(points.map((p) => p.value)).toEqual([0, 0, 0, 500, 0, 1900]);
  });
});

describe("earnings sums", () => {
  it("compares with the period before only when there is one", () => {
    expect(change(1120, 1000)).toBe(12);
    expect(change(500, 1000)).toBe(-50);
    expect(change(500, 0)).toBeNull();
  });
  it("works the fee back from the stored rate", () => {
    // KES 1,500 lesson at 20%: fee 300, withholding 60, expert 1,140.
    const b = breakdown([credit("2026-11-02T10:00:00Z", 1140, "b1", 0.2)], new Map([["b1", 60]]));
    expect(b).toEqual({ net_kes: 1140, fee_kes: 300, withholding_kes: 60, gross_kes: 1500 });
  });
  it("charges no fee on a trial and counts a booking's tax once", () => {
    const b = breakdown([credit("2026-11-02T10:00:00Z", 1425, "t1", 0), credit("2026-11-03T10:00:00Z", 100, "t1", 0)], new Map([["t1", 75]]));
    expect(b).toEqual({ net_kes: 1525, fee_kes: 0, withholding_kes: 75, gross_kes: 1600 });
  });
  it("picks a round top for the scale and short tick labels", () => {
    expect(niceMax(0)).toBe(1000);
    expect(niceMax(1900)).toBe(2000);
    expect(niceMax(48_500)).toBe(50_000);
    expect(niceMax(21_000)).toBe(25_000);
    expect(shortKES(2500)).toBe("2.5k");
    expect(shortKES(40_000)).toBe("40k");
    expect(shortKES(750)).toBe("750");
  });
});
