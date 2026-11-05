import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Video } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { BookingPill } from "@/components/app/booking-pill";
import { BookingSummary } from "@/components/app/booking-summary";
import { getMyBooking, getPolicyText } from "@/lib/data/bookings";
import { latestPayment } from "@/lib/payments";
import { formatDate, formatTime } from "@/domain/format";

export const metadata: Metadata = { title: "Booking" };

export default function BookingPage(props: PageProps<"/bookings/[id]">) {
  return (
    <Guarded next="/sessions">
      <Booking params={props.params} />
    </Guarded>
  );
}

async function Booking({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await getMyBooking(id);
  if (!b) notFound();
  const [p, policy] = await Promise.all([latestPayment(id), b.policy_version ? getPolicyText(b.policy_version) : null]);
  return (
    <div className="flex max-w-[620px] flex-col gap-6">
      <Link className="btn3 self-start" href="/sessions">
        All lessons
      </Link>
      <div className="flex flex-col gap-2">
        <BookingPill status={b.status} />
        <h1 className="t1">{b.title}</h1>
      </div>
      {b.status === "awaiting_payment" || b.status === "requested" ? (
        <Link className="btn self-start" href={`/checkout/${b.id}/pay`}>
          Finish paying
        </Link>
      ) : null}
      {b.status === "paid" ? (
        <p className="panel info">
          Waiting for {b.teacher_name.split(" ")[0]} to confirm, within 12 hours of payment. If they cannot, the full amount comes back to you as credit.
        </p>
      ) : null}
      {b.meeting_link ? (
        <a className="btn self-start" href={b.meeting_link} target="_blank" rel="noreferrer">
          <Video size={18} aria-hidden="true" />
          Join the lesson
        </a>
      ) : null}
      <BookingSummary b={b} />
      {p?.status === "succeeded" ? (
        <p className="help">
          Paid <span className="mono">{p.succeeded_at ? `${formatDate(p.succeeded_at)} ${formatTime(p.succeeded_at)}` : ""}</span> · reference{" "}
          <span className="mono">{p.platform_ref}</span>
        </p>
      ) : null}
      {policy ? (
        <details className="card p-5">
          <summary className="cursor-pointer font-semibold">Cancellation and refunds</summary>
          <p className="mt-2 text-ink-2">{policy}</p>
        </details>
      ) : null}
    </div>
  );
}
