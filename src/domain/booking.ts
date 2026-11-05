/** Booking states and labels (PRD §8.2). */

export const BOOKING_LABELS: Record<string, string> = {
  requested: "Not paid yet",
  awaiting_payment: "Waiting for payment",
  paid: "Paid, waiting for the teacher",
  accepted: "Accepted",
  scheduled: "Booked",
  in_progress: "In progress",
  awaiting_note: "Waiting for the lesson note",
  awaiting_confirmation: "Did it happen?",
  confirmed: "Done",
  disputed: "Problem reported",
  no_show_teacher: "Teacher did not come",
  no_show_learner: "Missed",
  cancelled: "Cancelled",
  lapsed: "No answer, credited",
};

export const BOOKING_TONE: Record<string, string> = {
  requested: "bg-sand text-ink-2",
  awaiting_payment: "bg-sand text-ink",
  paid: "bg-info-tint text-info",
  accepted: "bg-forest-tint text-forest-ink",
  scheduled: "bg-forest-tint text-forest-ink",
  in_progress: "bg-orange-wash text-orange-ink",
  awaiting_note: "bg-info-tint text-info",
  awaiting_confirmation: "bg-orange-wash text-orange-ink",
  confirmed: "bg-forest-tint text-forest-ink",
  disputed: "bg-error-tint text-error",
  no_show_teacher: "bg-error-tint text-error",
  no_show_learner: "bg-sand text-ink-2",
  cancelled: "bg-sand text-ink-2",
  lapsed: "bg-sand text-ink-2",
};

export const KIND_LABELS: Record<string, string> = {
  trial: "Trial lesson",
  single: "One lesson",
  package_session: "Package lesson",
  managed_plan_session: "Managed plan lesson",
  seat: "Seat",
};

export const CANCELLATION_POLICY_VERSION = "cancellation-2026-11-v1";

/** Slots must start at least this far ahead so the teacher can answer within the window. */
export const MIN_LEAD_HOURS = 2;

export function bookableSlots(slots: string[], now: Date): string[] {
  const cut = now.getTime() + MIN_LEAD_HOURS * 3600_000;
  return slots.filter((s) => new Date(s).getTime() >= cut);
}

/** Allow-listed meeting hosts (FR-SESS-1, §9.4); the database checks the same pattern. */
export function isAllowedMeetingLink(url: string) {
  return /^https:\/\/(meet\.google\.com|([a-z0-9-]+\.)?zoom\.us)\/[A-Za-z0-9/?=&._-]+$/.test(url.trim());
}

// ---------------------------------------------------------------------------
// Sprint 5: lesson day, cancellations and problems (FR-SESS-2..4, FR-BOOK-8, FR-DISP-1).
// The database applies the same rules; these only explain them before someone taps.

export const CANCELLATION_WINDOW_HOURS = 24;
export const GRACE_MINUTES = 15;
export const CHECKIN_OPENS_MINUTES = 10;
export const AUTO_CONFIRM_HOURS = 48;

export type CancelPreview =
  | { kind: "free"; text: string }
  | { kind: "credit"; text: string }
  | { kind: "released"; text: string }
  | { kind: "closed"; text: string };

/** What happens if the payer cancels now. */
export function cancelPreview(status: string, startsAt: string, now: Date, teacherFirst: string): CancelPreview {
  if (status === "requested" || status === "awaiting_payment") return { kind: "free", text: "Nothing has been paid, so nothing is charged." };
  if (status === "paid") return { kind: "credit", text: `${teacherFirst} has not accepted yet, so the full amount comes back to you as credit.` };
  if (status !== "accepted" && status !== "scheduled") return { kind: "closed", text: "This lesson can no longer be cancelled. Report a problem instead." };
  const hours = (new Date(startsAt).getTime() - now.getTime()) / 3600_000;
  if (hours >= CANCELLATION_WINDOW_HOURS) return { kind: "credit", text: `More than ${CANCELLATION_WINDOW_HOURS} hours ahead: the full amount comes back to you as credit.` };
  return { kind: "released", text: `Less than ${CANCELLATION_WINDOW_HOURS} hours ahead: ${teacherFirst} is paid for the reserved time and nothing comes back.` };
}

export type CheckinWindow = { state: "early" | "open" | "late"; opensAt: Date };

/** Check-in opens ten minutes before the start and closes two hours after the end. */
export function checkinWindow(startsAt: string, endsAt: string, now: Date): CheckinWindow {
  const opensAt = new Date(new Date(startsAt).getTime() - CHECKIN_OPENS_MINUTES * 60_000);
  if (now < opensAt) return { state: "early", opensAt };
  if (now.getTime() > new Date(endsAt).getTime() + 2 * 3600_000) return { state: "late", opensAt };
  return { state: "open", opensAt };
}

/** An absence (either side) can be reported once the grace period after the start has passed. */
export function graceOver(startsAt: string, now: Date) {
  return now.getTime() >= new Date(startsAt).getTime() + GRACE_MINUTES * 60_000;
}

export const PROBLEM_TYPES: Record<string, string> = {
  teacher_no_show: "The teacher did not come",
  short_session: "The lesson was cut short",
  quality: "The lesson was not what was promised",
  technical_failure: "Technical problems stopped the lesson",
  solicitation: "I was asked to pay outside Koobi",
  safety: "I felt unsafe",
  exception_request: "We missed it for a serious reason",
  other: "Something else",
};

/** Which problems the payer can report for a booking in this state. */
export function problemTypesFor(status: string, startsAt: string, now: Date): string[] {
  if (status === "awaiting_confirmation") return ["short_session", "quality", "technical_failure", "solicitation", "safety", "other"];
  if (status === "no_show_learner") return ["exception_request"];
  if (status === "scheduled" && graceOver(startsAt, now)) return ["teacher_no_show"];
  return [];
}

export const DISPUTE_STATUS_LABELS: Record<string, string> = {
  open: "Received",
  in_review: "Being reviewed",
  awaiting_party: "Waiting for a statement",
  escalated: "With a senior reviewer",
  resolved: "Decided",
  reopened: "Reopened",
  closed: "Closed",
};

export const DISPUTE_OUTCOME_LABELS: Record<string, string> = {
  release: "The teacher is paid",
  dismissed: "No change; the teacher is paid",
  partial_refund: "Part comes back to you as credit",
  credit: "The full amount comes back as credit",
  full_refund: "The full amount goes back to M-Pesa",
  teacher_penalty: "Full credit; the teacher is marked",
  replacement: "Full credit and a new teacher",
};

export const REFUND_STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  approved: "Approved",
  pending: "On its way",
  succeeded: "Refunded",
  failed: "Failed, retrying",
  cancelled: "Withdrawn",
};
