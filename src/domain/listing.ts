/** Listing approval machine for teacher profiles and offers (PRD FR-OFF-6, §8.6). */

export const LISTING_STATES = ["draft", "pending_review", "approved", "rejected", "paused", "retired"] as const;
export type ListingState = (typeof LISTING_STATES)[number];

const TRANSITIONS: Record<ListingState, readonly ListingState[]> = {
  draft: ["pending_review"],
  pending_review: ["approved", "rejected"],
  rejected: ["draft"],
  approved: ["draft", "paused", "retired"],
  paused: ["approved", "retired"],
  retired: [],
};

export function canTransition(from: ListingState, to: ListingState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transition(from: ListingState, to: ListingState): ListingState {
  if (!canTransition(from, to)) throw new Error(`Illegal listing transition ${from} → ${to}`);
  return to;
}

/** A listing is bookable only when approved AND the track's verification gate has passed. */
export function isBookable(state: ListingState, tierGatePassed: boolean): boolean {
  return state === "approved" && tierGatePassed;
}

export const LISTING_LABELS: Record<ListingState, string> = {
  draft: "Draft",
  pending_review: "In review",
  approved: "Live",
  rejected: "Changes needed",
  paused: "Paused",
  retired: "Retired",
};
