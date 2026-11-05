import type { ListingState } from "@/domain/listing";
import { LISTING_LABELS } from "@/domain/listing";

const TONE: Record<ListingState, string> = {
  draft: "bg-sand text-ink",
  pending_review: "bg-info-tint text-info",
  approved: "bg-forest-tint text-forest-ink",
  rejected: "bg-error-tint text-error",
  paused: "bg-sand text-ink-2",
  retired: "bg-sand text-ink-2",
};

/** Listing state as a label, never colour alone. */
export function ListingPill({ state }: { state: ListingState }) {
  return <span className={`pill ${TONE[state]}`}>{LISTING_LABELS[state]}</span>;
}
