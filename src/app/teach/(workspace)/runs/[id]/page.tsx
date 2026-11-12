import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, CalendarDays, Check, Clock, ReceiptText, Users, Video, Wallet } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { BookingPill } from "@/components/app/booking-pill";
import { getMyRuns, RUN_LABELS, RUN_TONE } from "@/lib/data/runs";
import { formatDate, formatDuration, formatKES, formatTime, formatWeekday, initials } from "@/domain/format";
import { DEFAULT_RATES, splitSession } from "@/domain/commission";
import { FORMATS, type FormatCode } from "@/domain/taxonomy";
import { MarkSessionForm, RunActions, RunLinkForm } from "../forms";

export const metadata: Metadata = { title: "Group details" };

const DONE: Record<string, string> = {
  created: "Dates added.",
  opened: "Open for booking. Learners can now book a seat.",
  confirmed: "Confirmed. This group will run.",
  cancelled: "Cancelled. Every learner who paid has the full amount back as credit.",
  marked: "Saved.",
};
const STATUS_NOTE: Record<string, string> = {
  draft: "A draft. It opens for booking once the learning experience is approved.",
  open: "Open for booking until 24 hours before the first session. Then it runs if the minimum is met; if not, it is cancelled and everyone is credited.",
  confirmed: "Confirmed: it will run. Bookings stay open until the cut-off while seats are left.",
  in_progress: "Under way. Mark each session after it starts.",
  completed: "Finished. Each seat is released to you when the learner confirms, or 48 hours after your note.",
  cancelled: "Cancelled.",
};
const ATT: Record<string, string> = { present: "Present", late: "Late", absent: "Absent" };
const HOLD: Record<string, string> = { held: "Paid, on hold", released: "Released to you", credited: "Returned as credit", refunded: "Refunded" };

/** T32: one group, in full: its sessions, who is in it, what they paid, and what to do next. */
export default function RunPage(props: PageProps<"/teach/runs/[id]">) {
  return (
    <Guarded next="/teach/runs">
      <Run params={props.params} searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Run({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp, { runs }] = await Promise.all([params, searchParams, getMyRuns()]);
  const r = runs.find((x) => x.id === id);
  if (!r) notFound();
  const now = new Date();
  const seats = r.seats.filter((s) => !["cancelled", "lapsed"].includes(s.status));
  const gone = r.seats.filter((s) => ["cancelled", "lapsed"].includes(s.status));
  const paid = seats.reduce((n, s) => n + s.price_kes, 0);
  const each = splitSession({ priceKes: r.price_kes, rate: DEFAULT_RATES.seat, vatRegistered: false });
  const next = r.sessions.find((s) => s.status === "scheduled");
  const canMark = ["confirmed", "in_progress"].includes(r.status) && next && new Date(next.starts_at).getTime() <= now.getTime();
  const name = (s: (typeof seats)[number]) => (s.payer_first_name && s.payer_first_name !== s.learner_alias ? `${s.learner_alias} (booked by ${s.payer_first_name})` : s.learner_alias);
  const done = typeof sp.done === "string" ? DONE[sp.done] : undefined;
  const cutoffPassed = new Date(r.cutoff_at).getTime() <= now.getTime();

  return (
    <div className="flex max-w-[1180px] flex-col gap-6">
      <nav className="flex items-center gap-2 text-[15px] text-ink-2" aria-label="Breadcrumb">
        <Link href="/teach/runs">Group dates</Link>
        <span aria-hidden="true">/</span>
        <span>Group details</span>
      </nav>
      {done ? (
        <p className={`panel ${sp.done === "cancelled" ? "info" : "escrow"}`} role="status">
          {done}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <h1 className="t1">{r.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`pill ${RUN_TONE[r.status]}`}>{RUN_LABELS[r.status]}</span>
          <span className="pill">{FORMATS[r.format as FormatCode]?.label ?? r.format}</span>
          <span className="help">
            {r.sessions.length > 1 ? "Starts " : ""}
            <span className="mono text-ink">{formatWeekday(r.starts_at)}</span>, <span className="mono text-ink">{formatTime(r.starts_at)}</span>
          </span>
        </div>
        <p className="text-ink-2">{r.status === "cancelled" && r.cancel_reason === "minimum_not_met" ? "Cancelled at the cut-off: too few learners had booked. Everyone was credited, with no mark on your record." : STATUS_NOTE[r.status]}</p>
      </div>

      <RunActions runId={r.id} status={r.status} seats={seats.length} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="card flex flex-col gap-4 p-5" aria-labelledby="people-h">
            <h2 id="people-h" className="t3 flex items-center gap-2">
              <Users size={20} aria-hidden="true" />
              Participants{" "}
              <span className="mono text-ink-2">
                ({seats.length} of {r.capacity_max})
              </span>
            </h2>
            {seats.length ? (
              <ul className="flex flex-col divide-y divide-dashed divide-line-2">
                {seats.map((s) => (
                  <li key={s.booking_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                    <span className="av sm" aria-hidden="true">
                      {initials(s.learner_alias)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold">{name(s)}</span>
                      <span className="text-[13.5px] leading-5 text-ink-2">
                        <span className="mono">{formatKES(s.price_kes)}</span> · {HOLD[s.hold_status ?? ""] ?? (s.paid_at ? "Paid with Koobi credit" : "Not paid")}
                        {s.paid_at ? (
                          <>
                            {" "}
                            · <span className="mono">{formatDate(s.paid_at)}</span>
                          </>
                        ) : null}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {r.sessions
                        .filter((x) => x.attendance[s.booking_id])
                        .map((x) => (
                          <span key={x.id} className={`pill ${x.attendance[s.booking_id] === "absent" ? "bg-error-tint text-error" : "bg-forest-tint text-forest-ink"}`} title={`Session ${x.sequence_no}`}>
                            <span className="mono">{x.sequence_no}</span> {ATT[x.attendance[s.booking_id]]}
                          </span>
                        ))}
                      {s.status !== "scheduled" ? <BookingPill status={s.status} /> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty">
                <Users size={24} aria-hidden="true" />
                <p className="font-semibold">Nobody has booked yet.</p>
                <p className="help">{r.status === "draft" ? "Open these dates for booking first." : "Learners who book a seat appear here once they have paid."}</p>
              </div>
            )}
            {gone.length ? (
              <p className="help">
                <span className="mono">{gone.length}</span> {gone.length === 1 ? "seat was" : "seats were"} cancelled and credited.
              </p>
            ) : null}
            <p className="help">You see first names only. Talk to a learner through Messages.</p>
          </section>

          <section className="card flex flex-col gap-4 p-5" aria-labelledby="sess-h">
            <h2 id="sess-h" className="t3 flex items-center gap-2">
              <CalendarDays size={20} aria-hidden="true" />
              Sessions
            </h2>
            <ol className="flex flex-col gap-3">
              {r.sessions.map((s) => {
                const marked = s.status !== "scheduled" && s.status !== "cancelled";
                const came = Object.values(s.attendance).filter((a) => a !== "absent").length;
                return (
                  <li key={s.id} className="flex flex-col gap-3 border-b border-dashed border-line-2 pb-3 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`stepn flex-none ${marked ? "bg-forest! text-white!" : ""}`}>{marked ? <Check size={18} aria-label="Marked" /> : s.sequence_no}</span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold">
                          <span className="mono">{formatWeekday(s.starts_at)}</span>, <span className="mono">{formatTime(s.starts_at)}</span> – <span className="mono">{formatTime(s.ends_at)}</span>
                        </span>
                        <span className="text-[14px] leading-5 text-ink-2">
                          {s.status === "cancelled" ? "Cancelled" : marked ? `${came} of ${Object.keys(s.attendance).length} came${s.covered ? ` · ${s.covered}` : ""}` : "Not marked yet"}
                        </span>
                      </span>
                    </div>
                    {canMark && next?.id === s.id ? (
                      <MarkSessionForm runId={r.id} sessionId={s.id} last={s.sequence_no === r.sessions.length} seats={seats.filter((x) => x.status === "scheduled").map((x) => ({ booking_id: x.booking_id, name: x.learner_alias }))} />
                    ) : null}
                  </li>
                );
              })}
            </ol>
            {["confirmed", "in_progress"].includes(r.status) && next && !canMark ? (
              <p className="help">
                You can mark session <span className="mono">{next.sequence_no}</span> once it has started.
              </p>
            ) : null}
            {r.status === "open" && cutoffPassed ? <p className="help">The cut-off has passed. Koobi confirms or cancels this group within a few minutes.</p> : null}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {!["completed", "cancelled"].includes(r.status) ? (
            <section className="card flex flex-col gap-3 p-5" aria-labelledby="link-h">
              <h2 id="link-h" className="t3 flex items-center gap-2">
                <Video size={20} aria-hidden="true" />
                Meeting
              </h2>
              <RunLinkForm runId={r.id} link={r.meeting_link ?? ""} />
            </section>
          ) : null}

          <section className="card flex flex-col gap-3 p-5" aria-labelledby="money-h">
            <h2 id="money-h" className="t3 flex items-center gap-2">
              <ReceiptText size={20} aria-hidden="true" />
              Payment summary
            </h2>
            <div className="flex flex-col">
              <span className="mono text-[28px] leading-9 tracking-tight">{formatKES(paid)}</span>
              <span className="help">
                Paid by <span className="mono">{seats.length}</span> {seats.length === 1 ? "learner" : "learners"}
              </span>
            </div>
            <div className="flex flex-col">
              <div className="kv">
                <span>Price per learner</span>
                <span>{formatKES(r.price_kes)}</span>
              </div>
              <div className="kv">
                <span>Koobi commission ({Math.round(DEFAULT_RATES.seat * 100)}%)</span>
                <span>− {formatKES(each.commission * seats.length)}</span>
              </div>
              <div className="kv">
                <span>Withholding tax (5%)</span>
                <span>− {formatKES(each.withholding * seats.length)}</span>
              </div>
              <div className="kv">
                <span className="font-semibold text-ink!">Your earnings</span>
                <span className="font-semibold">{formatKES(r.status === "cancelled" ? 0 : each.teacherNet * seats.length)}</span>
              </div>
            </div>
            <p className="help">{r.status === "cancelled" ? "Nothing is paid out for a cancelled group." : "An estimate at the standard rates. Each seat is posted to your balance when it is confirmed after the last session."}</p>
            <Link className="btn3 self-start" href="/teach/earnings">
              <Wallet size={16} aria-hidden="true" />
              Earnings & Payouts
            </Link>
          </section>

          <section className="card flex flex-col gap-3 p-5" aria-labelledby="facts-h">
            <h2 id="facts-h" className="t3 flex items-center gap-2">
              <BookOpen size={20} aria-hidden="true" />
              This group
            </h2>
            <div className="flex flex-col">
              <div className="kv">
                <span>Sessions</span>
                <span>
                  {r.sessions.length} × {formatDuration(r.duration_minutes)}
                </span>
              </div>
              <div className="kv">
                <span>Group size</span>
                <span>
                  {r.capacity_min} to {r.capacity_max}
                </span>
              </div>
              <div className="kv">
                <span className="flex items-center gap-2">
                  <Clock size={16} aria-hidden="true" /> Bookings close
                </span>
                <span>
                  {formatDate(r.cutoff_at)} {formatTime(r.cutoff_at)}
                </span>
              </div>
            </div>
            <Link className="btn3 self-start" href={`/teach/offers/${r.offering_id}`}>
              Edit the learning experience
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
