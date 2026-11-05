import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { BookingPill } from "@/components/app/booking-pill";
import { getTeachingBookings, type TeachingBooking } from "@/lib/data/bookings";
import { formatKES, formatTime, formatWeekday } from "@/domain/format";
import { humanMinutes } from "@/domain/matching";
import { KIND_LABELS } from "@/domain/booking";

export const metadata: Metadata = { title: "Bookings" };

const RESPONSE_HOURS = 12;

export default function TeachBookingsPage() {
  return (
    <Guarded next="/teach/bookings">
      <Bookings />
    </Guarded>
  );
}

function List({ rows, now }: { rows: TeachingBooking[]; now: number }) {
  return (
    <ul className="card flex flex-col divide-y divide-dashed divide-line-2 p-0!">
      {rows.map((b) => {
        const left = b.status === "paid" && b.paid_at ? Math.round((new Date(b.paid_at).getTime() + RESPONSE_HOURS * 3600_000 - now) / 60_000) : null;
        return (
          <li key={b.id}>
            <Link href={`/teach/bookings/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-ink no-underline hover:bg-orange-wash">
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold">
                  {KIND_LABELS[b.kind]} · {b.learner_alias}
                </span>
                <span className="help">
                  {b.title} · <span className="mono">{formatWeekday(b.starts_at)} {formatTime(b.starts_at)}</span> ·{" "}
                  <span className="mono">{formatKES(b.price_kes)}</span>
                </span>
                {left !== null ? <span className={`text-sm font-semibold ${left < 120 ? "text-error" : "text-orange-ink"}`}>Answer within {humanMinutes(Math.max(left, 0))}</span> : null}
              </span>
              <BookingPill status={b.status} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

async function Bookings() {
  const rows = await getTeachingBookings();
  const now = new Date().getTime();
  const waiting = rows.filter((b) => b.status === "paid");
  const upcoming = rows.filter((b) => ["accepted", "scheduled", "in_progress", "awaiting_note", "awaiting_confirmation"].includes(b.status));
  const past = rows.filter((b) => !waiting.includes(b) && !upcoming.includes(b));
  return (
    <div className="flex max-w-[860px] flex-col gap-7">
      <div className="flex flex-col gap-1">
        <h1 className="t1">Bookings</h1>
        <p className="text-ink-2">
          Paid bookings wait for your answer for {RESPONSE_HOURS} hours. If you do not answer, the learner gets the money back as credit.
        </p>
      </div>
      {waiting.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="w-h">
          <h2 id="w-h" className="t3">Waiting for you</h2>
          <List rows={waiting} now={now} />
        </section>
      ) : null}
      {upcoming.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="u-h">
          <h2 id="u-h" className="t3">Coming up</h2>
          <List rows={upcoming} now={now} />
        </section>
      ) : null}
      {past.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="p-h">
          <h2 id="p-h" className="t3">Earlier</h2>
          <List rows={past} now={now} />
        </section>
      ) : null}
      {!rows.length ? (
        <div className="empty">
          <CalendarDays size={24} aria-hidden="true" />
          <p className="font-semibold">No bookings yet.</p>
          <p className="help">Bookings appear here once a learner pays.</p>
        </div>
      ) : null}
    </div>
  );
}
