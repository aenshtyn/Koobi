import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { BookingPill } from "@/components/app/booking-pill";
import { getMyBookings, type MyBooking } from "@/lib/data/bookings";
import { formatTime, formatWeekday } from "@/domain/format";

export const metadata: Metadata = { title: "My lessons" };

const CLOSED = ["cancelled", "lapsed", "confirmed", "no_show_learner", "no_show_teacher", "disputed"];
const NEEDS_YOU = ["awaiting_confirmation", "awaiting_payment", "requested"];

export default function SessionsPage() {
  return (
    <Guarded next="/sessions">
      <Sessions />
    </Guarded>
  );
}

function Row({ b }: { b: MyBooking }) {
  return (
    <li>
      <Link href={b.status === "awaiting_confirmation" ? `/bookings/${b.id}/confirm` : `/bookings/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-ink no-underline hover:bg-orange-wash">
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold">{b.title}</span>
          <span className="help">
            {b.teacher_name} · <span className="mono">{formatWeekday(b.starts_at)} {formatTime(b.starts_at)}</span>
          </span>
        </span>
        <BookingPill status={b.status} />
      </Link>
    </li>
  );
}

async function Sessions() {
  const all = (await getMyBookings()).filter((b) => !(b.status === "cancelled" && !b.paid_at));
  const now = new Date().getTime();
  const needs = all.filter((b) => NEEDS_YOU.includes(b.status));
  const upcoming = all.filter((b) => !needs.includes(b) && !CLOSED.includes(b.status) && new Date(b.starts_at).getTime() > now - 3 * 3600_000).reverse();
  const past = all.filter((b) => !upcoming.includes(b) && !needs.includes(b));
  return (
    <div className="flex max-w-[760px] flex-col gap-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="t1">My lessons</h1>
        <Link className="btn3" href="/account/credits">
          Credits
        </Link>
      </div>
      {needs.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="needs-h">
          <h2 id="needs-h" className="t3">Needs you</h2>
          <ul className="card flex flex-col divide-y divide-dashed divide-line-2 p-0!">{needs.map((b) => <Row key={b.id} b={b} />)}</ul>
        </section>
      ) : null}
      {upcoming.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="up-h">
          <h2 id="up-h" className="t3">Coming up</h2>
          <ul className="card flex flex-col divide-y divide-dashed divide-line-2 p-0!">{upcoming.map((b) => <Row key={b.id} b={b} />)}</ul>
        </section>
      ) : (
        <div className="empty">
          <CalendarDays size={24} aria-hidden="true" />
          <p className="font-semibold">No lessons booked.</p>
          <p className="help">Your first trial is covered by the replacement promise.</p>
          <Link className="btn2" href="/explore">Find a lesson</Link>
        </div>
      )}
      {past.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="past-h">
          <h2 id="past-h" className="t3">Earlier</h2>
          <ul className="card flex flex-col divide-y divide-dashed divide-line-2 p-0!">{past.map((b) => <Row key={b.id} b={b} />)}</ul>
        </section>
      ) : null}
    </div>
  );
}
