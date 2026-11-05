import { describe, expect, it } from "vitest";
import { rankCandidates, slaFor, type Candidate } from "./matching";

const base: Candidate = {
  offering_id: "a",
  title: "English",
  slug: "english",
  teacher_name: "A",
  teacher_headline: "h",
  teacher_slug: "a",
  category: "career_professional_growth",
  track: "adults_professional",
  modes: ["online"],
  session_price_kes: 1800,
  duration_minutes: 60,
  tier: 1,
  rating_avg: null,
  review_count: 0,
  response_minutes: null,
  on_platform_hours: 0,
  weekly_windows: 2,
  applied: null,
};
const req = { category: "career_professional_growth", track: "adults_professional", mode: "online", budget_max_kes: 2000 };

describe("candidate ranking", () => {
  it("puts eligible candidates first and explains the failures", () => {
    const r = rankCandidates(req, [
      { ...base, offering_id: "x", modes: ["in_home"] },
      { ...base, offering_id: "y" },
    ]);
    expect(r.map((c) => c.offering_id)).toEqual(["y", "x"]);
    expect(r[1].eligible).toBe(false);
    expect(r[1].checks.find((c) => c.rule === "Where")?.ok).toBe(false);
  });
  it("allows up to 20% over budget and no more", () => {
    const [ok] = rankCandidates(req, [{ ...base, session_price_kes: 2400 }]);
    const [over] = rankCandidates(req, [{ ...base, session_price_kes: 2401 }]);
    expect(ok.eligible).toBe(true);
    expect(over.eligible).toBe(false);
  });
  it("sorts by tier, then rating with at least three reviews, then response time", () => {
    const r = rankCandidates(req, [
      { ...base, offering_id: "low-tier", tier: 0, rating_avg: 5, review_count: 20 },
      { ...base, offering_id: "two-reviews", rating_avg: 5, review_count: 2, response_minutes: 10 },
      { ...base, offering_id: "rated", rating_avg: 4.6, review_count: 9, response_minutes: 300 },
      { ...base, offering_id: "fast", response_minutes: 30 },
    ]);
    expect(r.map((c) => c.offering_id)).toEqual(["rated", "two-reviews", "fast", "low-tier"]);
  });
  it("needs availability windows", () => {
    expect(rankCandidates(req, [{ ...base, weekly_windows: 0 }])[0].eligible).toBe(false);
  });
});

describe("service-level timers", () => {
  const t0 = "2026-11-05T08:00:00Z";
  it("counts down to the 24-hour shortlist", () => {
    expect(slaFor("submitted", t0, new Date("2026-11-05T20:00:00Z"))).toMatchObject({ overdue: false, label: "shortlist due in 12 h" });
  });
  it("flags an overdue match after 48 hours", () => {
    expect(slaFor("shortlisted", t0, new Date("2026-11-07T09:30:00Z"))).toMatchObject({ overdue: true, label: "match overdue by 1 h 30 min" });
  });
  it("stops once matched", () => {
    expect(slaFor("matched", t0, new Date())).toBeNull();
  });
});
