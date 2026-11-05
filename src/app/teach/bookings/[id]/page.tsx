import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Video } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { BookingPill } from "@/components/app/booking-pill";
import { getTeachingBookings } from "@/lib/data/bookings";
import { formatDuration, formatKES, formatTime, formatWeekday } from "@/domain/format";
import { KIND_LABELS } from "@/domain/booking";
import { OFFER_MODES } from "@/domain/listing-input";
import { RespondForm } from "../respond-form";

export const metadata: Metadata = { title: "Booking" };

export default function TeachBookingPage(props: PageProps<"/teach/bookings/[id]">) {
  return (
    <Guarded next="/teach/bookings">
      <Booking params={props.params} searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Booking({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const b = (await getTeachingBookings()).find((x) => x.id === id);
  if (!b) notFound();
  return (
    <div className="flex max-w-[620px] flex-col gap-6">
      <Link className="btn3 self-start" href="/teach/bookings">
        All bookings
      </Link>
      {sp.done ? (
        <div className={`panel ${sp.done === "accepted" ? "escrow" : "info"} items-center`} role="status">
          <p>{sp.done === "accepted" ? "Accepted. The learner can now see the link." : "Declined. The learner has the money back as credit."}</p>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <BookingPill status={b.status} />
        <h1 className="t1">
          {KIND_LABELS[b.kind]} with {b.learner_alias}
        </h1>
        <p className="text-ink-2">{b.title}</p>
      </div>
      <div className="card flex flex-col p-5">
        <div className="kv"><span>When</span><span>{formatWeekday(b.starts_at)} {formatTime(b.starts_at)}</span></div>
        <div className="kv"><span>Length</span><span className="font-sans!">{formatDuration(b.duration_minutes)}</span></div>
        <div className="kv"><span>Where</span><span className="font-sans!">{OFFER_MODES.find(([c]) => c === b.mode)?.[1] ?? b.mode}</span></div>
        <div className="kv"><span>Booked by</span><span className="font-sans!">{b.payer_first_name ?? "Learner"}</span></div>
        <div className="kv">
          <span>Lesson price, before the fee and tax</span>
          <span>{formatKES(b.price_kes)}</span>
        </div>
      </div>
      {b.kind === "trial" ? <p className="help">Trial lessons are discounted for the learner; you are still paid on the full price.</p> : null}
      {b.status === "paid" ? <RespondForm bookingId={b.id} mode={b.mode} /> : null}
      {b.meeting_link ? (
        <a className="btn2 self-start" href={b.meeting_link} target="_blank" rel="noreferrer">
          <Video size={18} aria-hidden="true" />
          Open the meeting link
        </a>
      ) : null}
    </div>
  );
}
