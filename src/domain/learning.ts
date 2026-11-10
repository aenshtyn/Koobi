/**
 * The learner workspace: how a booking is grouped and worded for the person who booked it, when its
 * Join button opens, and how far along a learning experience is. Pure rules; the pages read records.
 */
import { BOOKING_LABELS, CHECKIN_OPENS_MINUTES } from "./booking";
import type { FormatCode } from "./taxonomy";

/** Which bookings each tab of My Bookings holds. "Pending" waits on a payment, the expert or the learner. */
export const LEARNER_GROUPS = {
  upcoming: ["accepted", "scheduled", "in_progress"],
  pending: ["requested", "awaiting_payment", "paid", "awaiting_note", "awaiting_confirmation", "disputed"],
  completed: ["confirmed", "no_show_learner"],
  cancelled: ["cancelled", "lapsed", "no_show_teacher"],
} as const;
export type LearnerGroup = keyof typeof LEARNER_GROUPS;

export function groupOf(status: string): LearnerGroup {
  for (const g of Object.keys(LEARNER_GROUPS) as LearnerGroup[]) if ((LEARNER_GROUPS[g] as readonly string[]).includes(status)) return g;
  return "pending";
}

/** A confirmed place is worded by format, as a learner would say it; every other state keeps its usual label. */
export function learnerStatusLabel(status: string, format: FormatCode): string {
  if (status === "accepted" || status === "scheduled") {
    if (format === "workshop") return "Registration confirmed";
    if (format === "cohort") return "Enrolled";
    return "Confirmed";
  }
  return BOOKING_LABELS[status] ?? status;
}

export const JOIN_LABELS: Record<FormatCode, string> = {
  one_to_one: "Join session",
  small_group: "Join class",
  workshop: "Join workshop",
  cohort: "Join session",
  site_visit: "Join session",
};

export const FORMAT_PLURALS: [FormatCode, string][] = [
  ["one_to_one", "One-to-one"],
  ["small_group", "Group classes"],
  ["workshop", "Workshops"],
  ["cohort", "Programmes"],
];

/** How long after the end the meeting link stays open, for a lesson that runs over. */
export const JOIN_CLOSES_MINUTES = 30;

export type JoinState = { state: "early"; opensAt: Date } | { state: "open" } | { state: "over" };

/** The Join button opens ten minutes before the start and closes half an hour after the end. */
export function joinState(startsAt: string, endsAt: string, now: Date): JoinState {
  const opensAt = new Date(new Date(startsAt).getTime() - CHECKIN_OPENS_MINUTES * 60_000);
  if (now < opensAt) return { state: "early", opensAt };
  if (now.getTime() > new Date(endsAt).getTime() + JOIN_CLOSES_MINUTES * 60_000) return { state: "over" };
  return { state: "open" };
}

export type ExperienceState = "upcoming" | "in_progress" | "completed";

/**
 * Where a learner is with one learning experience: nothing done yet and something booked is
 * "upcoming"; something done and more to come is "in progress"; nothing more booked is "completed".
 * Null when there is nothing to show (every booking was cancelled).
 */
export function experienceState(p: { done: number; live: number; remaining: number }): ExperienceState | null {
  if (p.live > 0 || p.remaining > 0) return p.done > 0 ? "in_progress" : "upcoming";
  return p.done > 0 ? "completed" : null;
}

export const EXPERIENCE_LABELS: Record<ExperienceState, string> = { upcoming: "Upcoming", in_progress: "In progress", completed: "Completed" };
export const EXPERIENCE_TONE: Record<ExperienceState, string> = {
  upcoming: "bg-orange-wash text-orange-ink",
  in_progress: "bg-forest-tint text-forest-ink",
  completed: "bg-sand text-ink",
};

/** Whole per cent of a total, never above 100; 0 when there is no total. */
export function percent(done: number, total: number | null): number {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}

export const PAYMENT_LABELS: Record<string, string> = {
  initiated: "Not finished",
  pending: "Pending",
  succeeded: "Successful",
  failed: "Failed",
  refunded: "Refunded",
  partially_refunded: "Part refunded",
  charged_back: "Charged back",
};
export const PAYMENT_TONE: Record<string, string> = {
  initiated: "bg-sand text-ink-2",
  pending: "bg-orange-wash text-orange-ink",
  succeeded: "bg-forest-tint text-forest-ink",
  failed: "bg-error-tint text-error",
  refunded: "bg-info-tint text-info",
  partially_refunded: "bg-info-tint text-info",
  charged_back: "bg-error-tint text-error",
};
export const METHOD_LABELS: Record<string, string> = { mpesa_stk: "M-Pesa", card: "Card", payment_link: "Payment link" };

/** Which tab of Payments & Transactions a payment sits under. */
export function paymentTab(status: string): "successful" | "pending" | "failed" | "refunded" {
  if (status === "succeeded") return "successful";
  if (status === "pending" || status === "initiated") return "pending";
  if (status === "refunded" || status === "partially_refunded") return "refunded";
  return "failed";
}

/** Why a learner cancels: a short list, sent as the reason text. */
export const CANCEL_REASONS = ["The time no longer works", "I booked by mistake", "I found another time with this expert", "I no longer need this", "Something else"] as const;

/** Where a lesson happens, as the learner reads it. */
export const LEARNER_MODES: Record<string, string> = {
  online: "Online",
  in_home: "At your home",
  teacher_premises: "At the expert's place",
  hybrid: "Online or in person",
  site: "On site",
};

// ---------------------------------------------------------------------------
// My Learning and My Schedule, built from the learner's bookings

type SeatSession = { sequence_no: number; starts_at: string; ends_at: string; status: string; attendance: "present" | "late" | "absent" | null };
/** The parts of a booking these views read. The data layer's booking record has them all. */
export type BookingView = {
  id: string;
  offering_id: string;
  slug: string;
  title: string;
  teacher_name: string;
  teacher_slug: string | null;
  teacher_headline: string | null;
  learner_alias: string;
  status: string;
  starts_at: string;
  duration_minutes: number;
  format: FormatCode;
  group: LearnerGroup;
  /** For a seat in a group: its dates. Null for a one-to-one lesson. */
  seat: { run_status: string; sessions: SeatSession[] } | null;
  /** A seat's next session (or its last once over); otherwise the lesson's start. */
  when: string;
  ends: string;
};
export type PackageView = { status: string; sessions_total: number; sessions_used: number; offering: { id: string } | null };

export type ExperienceOf<B extends BookingView, P extends PackageView> = {
  offering_id: string;
  slug: string;
  title: string;
  teacher_name: string;
  teacher_slug: string | null;
  teacher_headline: string | null;
  format: FormatCode;
  state: ExperienceState;
  /** Lessons or group sessions that have happened. */
  done: number;
  /** Known only for a package or a group with set dates; null for single lessons. */
  total: number | null;
  /** The next lesson or session, if one is booked. */
  next: { at: string; ends: string; booking: B } | null;
  started: string | null;
  learners: string[];
  bookings: B[];
  packages: P[];
};

const LIVE_STATES = ["paid", "accepted", "scheduled", "in_progress", "awaiting_note", "awaiting_confirmation"];
const endOf = (start: string, minutes: number) => new Date(new Date(start).getTime() + minutes * 60_000).toISOString();

/** One entry per learning experience the learner has booked, in progress first. Cancelled-only ones are left out. */
export function experiencesOf<B extends BookingView, P extends PackageView>(bookings: B[], packages: P[], now: Date): ExperienceOf<B, P>[] {
  const t = now.getTime();
  const byOffer = new Map<string, B[]>();
  for (const b of bookings) byOffer.set(b.offering_id, [...(byOffer.get(b.offering_id) ?? []), b]);
  const out: ExperienceOf<B, P>[] = [];
  for (const [offering_id, rows] of byOffer) {
    const first = rows[0];
    const pkgs = packages.filter((p) => p.offering?.id === offering_id && ["active", "completed"].includes(p.status));
    const seats = rows.filter((b) => b.seat && b.seat.run_status !== "cancelled" && b.group !== "cancelled");
    let done = 0;
    let total: number | null = null;
    let remaining = 0;
    if (seats.length) {
      // A group: sessions that have ended, out of the sessions on its dates.
      const sessions = seats.flatMap((b) => b.seat!.sessions.filter((s) => s.status !== "cancelled"));
      done = sessions.filter((s) => new Date(s.ends_at).getTime() <= t).length;
      total = sessions.length;
      remaining = total - done;
    } else {
      done = rows.filter((b) => b.status === "confirmed").length;
      if (pkgs.length) {
        remaining = pkgs.filter((p) => p.status === "active").reduce((n, p) => n + Math.max(0, p.sessions_total - p.sessions_used), 0);
        // Lessons outside any package still count as done, so the total never falls below it.
        total = Math.max(pkgs.reduce((n, p) => n + p.sessions_total, 0), done);
      }
    }
    const live = rows.filter((b) => LIVE_STATES.includes(b.status) && new Date(b.ends).getTime() > t - 3 * 3600_000);
    const state = experienceState({ done, live: live.length, remaining });
    if (!state) continue;
    const upcoming = live.filter((b) => new Date(b.ends).getTime() > t).sort((a, b) => a.when.localeCompare(b.when))[0];
    const dated = rows.filter((b) => b.group !== "cancelled").map((b) => b.seat?.sessions[0]?.starts_at ?? b.starts_at).sort();
    out.push({
      offering_id,
      slug: first.slug,
      title: first.title,
      teacher_name: first.teacher_name,
      teacher_slug: first.teacher_slug,
      teacher_headline: first.teacher_headline,
      format: first.format,
      state,
      done,
      total,
      next: upcoming ? { at: upcoming.when, ends: upcoming.ends, booking: upcoming } : null,
      started: dated[0] ?? null,
      learners: [...new Set(rows.map((b) => b.learner_alias))],
      bookings: rows,
      packages: pkgs,
    });
  }
  const order: Record<ExperienceState, number> = { in_progress: 0, upcoming: 1, completed: 2 };
  return out.sort((a, b) => order[a.state] - order[b.state] || (a.next?.at ?? "9999").localeCompare(b.next?.at ?? "9999") || a.title.localeCompare(b.title));
}

export type ActivityOf<B extends BookingView> = {
  key: string;
  at: string;
  ends: string;
  booking: B;
  /** "2 of 6" for a group with several sessions. */
  part: { n: number; of: number } | null;
  attendance: "present" | "late" | "absent" | null;
  cancelled: boolean;
};

/** Every dated activity, oldest first: a lesson once, a group's sessions one by one. Unpaid and cancelled bookings are left out. */
export function activitiesOf<B extends BookingView>(bookings: B[]): ActivityOf<B>[] {
  const out: ActivityOf<B>[] = [];
  for (const b of bookings) {
    if (b.group === "cancelled" || b.status === "requested" || b.status === "awaiting_payment") continue;
    if (b.seat) {
      if (b.seat.run_status === "cancelled") continue;
      const of = b.seat.sessions.length;
      for (const s of b.seat.sessions) {
        out.push({ key: `${b.id}:${s.sequence_no}`, at: s.starts_at, ends: s.ends_at, booking: b, part: of > 1 ? { n: s.sequence_no, of } : null, attendance: s.attendance, cancelled: s.status === "cancelled" });
      }
    } else {
      out.push({ key: b.id, at: b.starts_at, ends: endOf(b.starts_at, b.duration_minutes), booking: b, part: null, attendance: null, cancelled: false });
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
