import { REQUEST_STATUS_LABELS } from "@/domain/matching";

const TONE: Record<string, string> = {
  submitted: "bg-info-tint text-info",
  triaged: "bg-info-tint text-info",
  shortlisted: "bg-orange-wash text-orange-ink",
  matched: "bg-forest-tint text-forest-ink",
  unmatched: "bg-sand text-ink-2",
  withdrawn: "bg-sand text-ink-2",
};

export function RequestPill({ status }: { status: string }) {
  return <span className={`pill ${TONE[status] ?? "bg-sand"}`}>{REQUEST_STATUS_LABELS[status] ?? status}</span>;
}
