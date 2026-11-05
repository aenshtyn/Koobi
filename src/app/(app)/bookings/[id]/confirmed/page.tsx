import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Guarded } from "@/components/app/shell";
import { BookingSummary } from "@/components/app/booking-summary";
import { getMyBooking } from "@/lib/data/bookings";
import { latestPayment } from "@/lib/payments";
import { formatDate, formatKES, formatTime } from "@/domain/format";

export const metadata: Metadata = { title: "Booked" };

export default function ConfirmedPage(props: PageProps<"/bookings/[id]/confirmed">) {
  return (
    <Guarded next="/sessions">
      <Confirmed params={props.params} />
    </Guarded>
  );
}

async function Confirmed({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [b, p] = await Promise.all([getMyBooking(id), latestPayment(id)]);
  if (!b) notFound();
  const paid = p?.status === "succeeded";
  return (
    <div className="flex max-w-[560px] flex-col gap-6">
      <span className="seal self-start text-[48px]" aria-hidden="true" />
      <h1 className="t1">
        {paid ? (
          <>
            <span lang="sw">Imelipwa.</span> Paid.
          </>
        ) : (
          "Your booking"
        )}
      </h1>
      {paid && p ? (
        <div className="card r3 flex flex-col p-5">
          <div className="kv">
            <span>Amount held</span>
            <span>{formatKES(p.amount_kes)}</span>
          </div>
          <div className="kv">
            <span>Reference</span>
            <span>{p.platform_ref}</span>
          </div>
          <div className="kv">
            <span>Paid</span>
            <span>{p.succeeded_at ? `${formatDate(p.succeeded_at)} ${formatTime(p.succeeded_at)}` : "—"}</span>
          </div>
        </div>
      ) : null}
      <ol className="flex flex-col gap-3">
        {[
          `${b.teacher_name.split(" ")[0]} confirms within 12 hours and adds the meeting link. If not, the full amount comes back to you as credit.`,
          "We remind you before the lesson, by SMS or WhatsApp.",
          "After the lesson, confirm it happened. Only then is the teacher paid.",
        ].map((s, i) => (
          <li key={s} className="flex items-start gap-3">
            <span className="stepn flex-none">{i + 1}</span>
            <span className="pt-1">{s}</span>
          </li>
        ))}
      </ol>
      <BookingSummary b={b} />
      <div className="flex flex-wrap gap-3">
        <Link className="btn" href={`/bookings/${b.id}`}>
          See the booking
        </Link>
        <Link className="btn2 ink" href="/messages">
          Messages
        </Link>
      </div>
    </div>
  );
}
