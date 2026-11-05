import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { getEarnings, getMyTeacherPayout } from "@/lib/data/earnings";
import { getTeachingBookings } from "@/lib/data/bookings";
import { formatDate, formatKES } from "@/domain/format";
import { PAYOUT_STATUS_LABELS } from "@/domain/payouts";

export const metadata: Metadata = { title: "Earnings" };

/** T22: pending, released, paid (FR-PAYOUT-1). */
export default function EarningsPage() {
  return (
    <Guarded next="/teach/earnings">
      <Earnings />
    </Guarded>
  );
}

async function Earnings() {
  const [{ summary, unpaid, payouts }, payout, bookings] = await Promise.all([getEarnings(), getMyTeacherPayout(), getTeachingBookings()]);
  const s = summary ?? { held_kes: 0, owed_kes: 0, in_payout_kes: 0, paid_kes: 0, threshold_kes: 500, next_payout_on: "" };
  const waiting = s.owed_kes - s.in_payout_kes;
  const blockers = [!payout.kraMasked ? "Add your KRA PIN" : null, payout.ownership !== "passed" ? "Prove your payout number" : null].filter(Boolean) as string[];
  const title = (id: string | null) => bookings.find((b) => b.id === id)?.title ?? "Lesson";
  const when = (id: string | null) => bookings.find((b) => b.id === id)?.starts_at;
  return (
    <div className="flex max-w-[860px] flex-col gap-6">
      <h1 className="t1">Earnings</h1>
      {blockers.length ? (
        <div className="panel error flex-wrap items-center">
          <span>Payouts are paused: {blockers.join(" and ").toLowerCase()}.</span>
          <Link className="btn3" href="/teach/settings">
            Open settings
          </Link>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="stat">
          <span className="help">On hold for coming lessons</span>
          <span className="v">{formatKES(s.held_kes)}</span>
          <span className="help">What learners paid, before fee and tax</span>
        </div>
        <div className="stat">
          <span className="help">Released, next payout</span>
          <span className="v">{formatKES(Math.max(waiting, 0))}</span>
          <span className="help">{s.next_payout_on ? <>Friday <span className="mono">{formatDate(s.next_payout_on)}</span></> : "Weekly"}</span>
        </div>
        <div className="stat">
          <span className="help">In a payout now</span>
          <span className="v">{formatKES(s.in_payout_kes)}</span>
        </div>
        <div className="stat">
          <span className="help">Paid to M-Pesa</span>
          <span className="v">{formatKES(s.paid_kes)}</span>
        </div>
      </div>
      <p className="help">
        Payouts go out weekly once at least <span className="mono">{formatKES(s.threshold_kes)}</span> is released; smaller amounts wait for the next week.
      </p>
      <section className="flex flex-col gap-3" aria-labelledby="rel-h">
        <h2 id="rel-h" className="t3">
          Released, not yet paid
        </h2>
        {unpaid.length ? (
          <ul className="card flex flex-col divide-y divide-dashed divide-line-2 p-0!">
            {unpaid.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <span className="flex flex-col">
                  <span>{title(e.booking_id)}</span>
                  <span className="help mono">{when(e.booking_id) ? formatDate(when(e.booking_id)!) : formatDate(e.posted_at)}</span>
                </span>
                <span className="mono">{formatKES(e.amount_kes)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">
            <Wallet size={24} aria-hidden="true" />
            <p className="font-semibold">Nothing waiting.</p>
            <p className="help">A lesson is released when the learner confirms it, or 48 hours after your note.</p>
          </div>
        )}
      </section>
      {payouts.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="po-h">
          <h2 id="po-h" className="t3">
            Payouts
          </h2>
          <ul className="card flex flex-col divide-y divide-dashed divide-line-2 p-0!">
            {payouts.map((p) => (
              <li key={p.id}>
                <Link href={`/teach/statements/${p.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-ink no-underline hover:bg-orange-wash">
                  <span className="flex flex-col">
                    <span>Week of {p.batch ? <span className="mono">{formatDate(p.batch.week_start)}</span> : "—"}</span>
                    <span className="help">{PAYOUT_STATUS_LABELS[p.status] ?? p.status}{p.exclusion_reason ? ` · ${p.exclusion_reason}` : ""}</span>
                  </span>
                  <span className="mono">{formatKES(p.net_kes)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
