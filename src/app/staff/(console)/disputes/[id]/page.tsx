import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Guarded } from "@/components/app/shell";
import { BookingPill } from "@/components/app/booking-pill";
import { LessonNote } from "@/components/app/lesson-note";
import { getDisputeCase } from "@/lib/data/staff-cases";
import { DISPUTE_OUTCOME_LABELS, DISPUTE_STATUS_LABELS, KIND_LABELS, PROBLEM_TYPES } from "@/domain/booking";
import { formatDate, formatDuration, formatKES, formatTime } from "@/domain/format";
import { DecideForm } from "../decide-form";

export const metadata: Metadata = { title: "Dispute", robots: { index: false } };

const at = (iso: string | null | undefined) => (iso ? `${formatDate(iso)} ${formatTime(iso)}` : "—");

/** S12: evidence and outcome (FR-DISP-3). */
export default function StaffDisputePage(props: PageProps<"/staff/disputes/[id]">) {
  return (
    <Guarded next="/staff/disputes" anyOf={["concierge", "finance", "admin"]}>
      <Case params={props.params} searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Case({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const c = await getDisputeCase(id);
  if (!c) notFound();
  const { dispute: d, session: s, note, payment: p, log } = c;
  const b = d.booking;
  const decided = d.status === "resolved" || d.status === "closed";
  const tookPlace = b && ["disputed", "no_show_learner", "awaiting_confirmation"].includes(b.status);
  const outcomes = Object.entries(DISPUTE_OUTCOME_LABELS).filter(([code]) => tookPlace || !["release", "dismissed", "partial_refund"].includes(code));
  return (
    <div className="flex max-w-[860px] flex-col gap-6">
      <Link className="btn3 self-start" href="/staff/disputes">
        All disputes
      </Link>
      {sp.done ? (
        <p className="panel escrow" role="status">
          Decision recorded. The ledger is posted and both sides can see the outcome.
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <h1 className="t1">{PROBLEM_TYPES[d.type] ?? d.type}</h1>
        <p className="text-ink-2">
          {DISPUTE_STATUS_LABELS[d.status] ?? d.status} · reported by the {d.opened_by_role} <span className="mono">{at(d.created_at)}</span> · due{" "}
          <span className="mono">{at(d.sla_due_at)}</span>
        </p>
      </div>
      {d.description ? <p className="card whitespace-pre-line p-5">{d.description}</p> : null}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card flex flex-col p-5" aria-label="Lesson">
          <h2 className="t3 mb-2">Lesson</h2>
          {b ? (
            <>
              <div className="kv"><span>What</span><span className="font-sans!">{KIND_LABELS[b.kind]} · {b.offering?.title}</span></div>
              <div className="kv"><span>Teacher</span><span className="font-sans!">{b.teacher?.display_name ?? "—"}</span></div>
              <div className="kv"><span>Learner</span><span className="font-sans!">{b.learner?.alias ?? "—"}</span></div>
              <div className="kv"><span>Booked for</span><span>{at(b.starts_at)}</span></div>
              <div className="kv"><span>Length</span><span className="font-sans!">{formatDuration(b.duration_minutes)}</span></div>
              <div className="kv"><span>Status</span><span><BookingPill status={b.status} /></span></div>
            </>
          ) : null}
        </section>
        <section className="card flex flex-col p-5" aria-label="Attendance and money">
          <h2 className="t3 mb-2">Attendance and money</h2>
          <div className="kv"><span>Checked in</span><span>{at(s?.checked_in_at)}</span></div>
          <div className="kv"><span>Checked out</span><span>{at(s?.checked_out_at)}</span></div>
          <div className="kv"><span>Logged</span><span>{s?.actual_minutes ? formatDuration(s.actual_minutes) : "—"}</span></div>
          <div className="kv"><span>Paid</span><span>{p ? formatKES(p.amount_kes) : "—"}</span></div>
          <div className="kv"><span>Payment</span><span>{p ? `${p.platform_ref} · ${p.method}` : "—"}</span></div>
          <div className="kv"><span>Hold</span><span className="font-sans!">{p?.hold_status ?? "—"}</span></div>
        </section>
      </div>
      {note ? <LessonNote note={note} heading="Teacher’s lesson note" /> : <p className="help">No lesson note was filed.</p>}

      {decided ? (
        <section className="panel escrow flex-col" aria-label="Decision">
          <b>{d.outcome ? DISPUTE_OUTCOME_LABELS[d.outcome] : "Decided"}</b>
          {d.credit_kes ? <span>Credit: <span className="mono">{formatKES(d.credit_kes)}</span></span> : null}
          {d.refund_kes ? <span>Refund queued: <span className="mono">{formatKES(d.refund_kes)}</span> (see Refunds)</span> : null}
          {d.evidence_snapshot?.resolution_note ? <span>{d.evidence_snapshot.resolution_note}</span> : null}
        </section>
      ) : p?.hold_status === "held" ? (
        <DecideForm disputeId={d.id} outcomes={outcomes} amount={p.amount_kes} trial={b?.kind === "trial"} />
      ) : (
        <p className="panel info">The payment is no longer held, so no outcome can be posted from here.</p>
      )}

      {log.length ? (
        <section className="flex flex-col gap-2" aria-label="Time log">
          <h2 className="t3">Time spent</h2>
          <ul className="flex flex-col">
            {log.map((l, i) => (
              <li key={i} className="flex justify-between gap-3 border-b border-dashed border-line-2 py-2">
                <span className="help">{l.note}</span>
                <span className="mono">{l.minutes} min</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
