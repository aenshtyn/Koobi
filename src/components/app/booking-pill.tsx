import { BOOKING_LABELS, BOOKING_TONE } from "@/domain/booking";

export function BookingPill({ status }: { status: string }) {
  return <span className={`pill ${BOOKING_TONE[status] ?? "bg-sand"}`}>{BOOKING_LABELS[status] ?? status}</span>;
}
