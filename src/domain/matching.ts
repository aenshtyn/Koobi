/**
 * Candidate ranking for the concierge console (PRD FR-MATCH-5).
 * Hard filters first, each with a pass or fail reason the concierge can read; then the sort:
 * effective tier, rating (rated before unrated), response time, on-platform hours.
 * Deterministic, so a decision can be explained later from the stored snapshot.
 */
import { formatKES } from "./format";

export type RequestForRanking = {
  category: string;
  track: string;
  mode: string;
  budget_max_kes: number | null;
};

export type Candidate = {
  offering_id: string;
  title: string;
  slug: string;
  teacher_name: string;
  teacher_headline: string;
  teacher_slug: string;
  category: string;
  track: string;
  modes: string[];
  session_price_kes: number;
  duration_minutes: number;
  tier: number;
  rating_avg: number | null;
  review_count: number;
  response_minutes: number | null;
  on_platform_hours: number;
  weekly_windows: number;
  applied: { pitch: string; proposed_price_kes: number | null } | null;
};

export type Check = { rule: string; ok: boolean; note: string };
export type Ranked = Candidate & { checks: Check[]; eligible: boolean };

/** Up to 20% over the stated budget is still shown (PRD FR-MATCH-5) [assumption]. */
export const BUDGET_TOLERANCE = 0.2;

function modeOk(requestMode: string, offerModes: string[]) {
  if (requestMode === "hybrid") return offerModes.length > 0;
  return offerModes.includes(requestMode) || offerModes.includes("hybrid");
}

export function checksFor(req: RequestForRanking, c: Candidate): Check[] {
  const checks: Check[] = [
    { rule: "Track", ok: c.track === req.track, note: c.track === req.track ? "Same track" : `Offer is ${c.track}` },
    {
      rule: "Where",
      ok: modeOk(req.mode, c.modes),
      note: modeOk(req.mode, c.modes) ? "Mode fits" : `Request wants ${req.mode}; offer is ${c.modes.join(", ")}`,
    },
    {
      rule: "Times",
      ok: c.weekly_windows > 0,
      note: c.weekly_windows > 0 ? `${c.weekly_windows} weekly ${c.weekly_windows === 1 ? "window" : "windows"}` : "No availability set",
    },
  ];
  if (req.budget_max_kes) {
    const cap = Math.round(req.budget_max_kes * (1 + BUDGET_TOLERANCE));
    const ok = c.session_price_kes <= cap;
    checks.push({
      rule: "Budget",
      ok,
      note: ok
        ? `${formatKES(c.session_price_kes)} within ${formatKES(req.budget_max_kes)}${c.session_price_kes > req.budget_max_kes ? " (+20% allowed)" : ""}`
        : `${formatKES(c.session_price_kes)} is over ${formatKES(cap)}`,
    });
  }
  if (c.category !== req.category) checks.push({ rule: "Category", ok: true, note: "Different category (allowed)" });
  return checks;
}

const ratingKey = (c: Candidate) => (c.rating_avg !== null && c.review_count >= 3 ? c.rating_avg : -1);

export function rankCandidates(req: RequestForRanking, candidates: Candidate[]): Ranked[] {
  return candidates
    .map((c) => {
      const checks = checksFor(req, c);
      return { ...c, checks, eligible: checks.every((x) => x.ok) };
    })
    .sort(
      (a, b) =>
        Number(b.eligible) - Number(a.eligible) ||
        b.tier - a.tier ||
        ratingKey(b) - ratingKey(a) ||
        (a.response_minutes ?? Number.MAX_SAFE_INTEGER) - (b.response_minutes ?? Number.MAX_SAFE_INTEGER) ||
        b.on_platform_hours - a.on_platform_hours ||
        Number(!!b.applied) - Number(!!a.applied) ||
        a.offering_id.localeCompare(b.offering_id),
    );
}

/** What is stored on the match so the ranking can be reproduced later. */
export function snapshot(r: Ranked) {
  return {
    tier: r.tier,
    rating_avg: r.rating_avg,
    review_count: r.review_count,
    response_minutes: r.response_minutes,
    on_platform_hours: r.on_platform_hours,
    session_price_kes: r.session_price_kes,
    checks: r.checks.map(({ rule, ok }) => ({ rule, ok })),
  };
}

// ---------------------------------------------------------------------------
// Service-level timers (FR-MATCH-2): shortlist within 24 hours, match within 48.

export type Sla = { label: string; overdue: boolean; dueAt: Date };

export function slaFor(status: string, submittedAt: string, now: Date): Sla | null {
  const start = new Date(submittedAt).getTime();
  const due = (h: number) => new Date(start + h * 3600_000);
  const target = status === "submitted" || status === "triaged" ? due(24) : status === "shortlisted" ? due(48) : null;
  if (!target) return null;
  const mins = Math.round((target.getTime() - now.getTime()) / 60_000);
  const what = status === "shortlisted" ? "match" : "shortlist";
  if (mins < 0) return { label: `${what} overdue by ${humanMinutes(-mins)}`, overdue: true, dueAt: target };
  return { label: `${what} due in ${humanMinutes(mins)}`, overdue: false, dueAt: target };
}

export function humanMinutes(m: number) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60 ? `${m % 60} min` : ""}`.trim();
  return `${Math.floor(h / 24)} days`;
}

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  submitted: "New",
  triaged: "Being matched",
  shortlisted: "Shortlist sent",
  matched: "Matched",
  unmatched: "No match",
  withdrawn: "Withdrawn",
};

export const PITCH_MAX = 300;
export const MESSAGE_MAX = 2000;
