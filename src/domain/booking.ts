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
