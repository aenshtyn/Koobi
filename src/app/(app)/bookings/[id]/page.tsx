import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Video } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { BookingPill } from "@/components/app/booking-pill";
import { BookingSummary } from "@/components/app/booking-summary";
import { LessonNote } from "@/components/app/lesson-note";
import { getOpenReschedule, getPolicyText } from "@/lib/data/bookings";
import { getMyLesson } from "@/lib/data/lessons";
import { latestPayment } from "@/lib/payments";
import { formatDate, formatKES, formatTime } from "@/domain/format";
import { AUTO_CONFIRM_HOURS, DISPUTE_STATUS_LABELS, PROBLEM_TYPES, cancelPreview, problemTypesFor } from "@/domain/booking";
import { CancelForm } from "../forms";
import { getMySeat } from "@/lib/data/runs";
import { RescheduleAnswer, RescheduleForm } from "@/app/teach/sessions/forms";
import { TIME_OPTIONS, dayKey } from "@/domain/schedule";

export const metadata: Metadata = { title: "Booking" };

const DONE: Record<string, { tone: string; text: string }> = {
  confirmed: { tone: "escrow", text: "Thank you. The lesson is confirmed and the teacher is paid in the next weekly payout." },
  "cancelled-credit": { tone: "info", text: "Cancelled. The full amount is now credit on your account." },
  "cancelled-late": { tone: "info", text: "Cancelled. Because it was inside 24 hours, the teacher keeps the payment." },
  cancelled: { tone: "info", text: "Cancelled. Nothing was charged." },
  reviewed: { tone: "escrow", text: "Thank you. Your review is on the learning experience page." },
  move_asked: { tone: "info", text: "Sent. The teacher has 6 hours to accept the new time." },
  moved: { tone: "escrow", text: "The lesson has moved to the new time." },
  move_declined: { tone: "info", text: "The lesson stays at its time." },
  move_withdrawn: { tone: "info", text: "Request withdrawn. The lesson stays at its time." },
};

export default function BookingPage(props: PageProps<"/bookings/[id]">) {
  return (
    <Guarded next="/sessions">
      <Booking params={props.params} searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Booking({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const lesson = await getMyLesson(id);
  if (!lesson) notFound();
  const { booking: b, note, disputes, review } = lesson;
  const [p, policy, move, seat] = await Promise.all([latestPayment(id), b.policy_version ? getPolicyText(b.policy_version) : null, getOpenReschedule(id), b.kind === "seat" ? getMySeat(id) : null]);
  const now = new Date();
  const movable = b.kind !== "seat" && ["accepted", "scheduled"].includes(b.status) && new Date(b.starts_at).getTime() - now.getTime() > 24 * 3600_000;
  const teacherFirst = b.teacher_name.split(" ")[0];
  const cancel = cancelPreview(b.status, b.starts_at, now, teacherFirst);
  const problems = problemTypesFor(b.status, b.starts_at, now);
  const openDispute = disputes.find((d) => !["resolved", "closed"].includes(d.status));
  const done = typeof sp.done === "string" ? DONE[sp.done] : undefined;

  return (
    <div className="flex max-w-[620px] flex-col gap-6">
      <Link className="btn3 self-start" href="/sessions">
        All lessons
      </Link>
      {done ? (
        <p className={`panel ${done.tone}`} role="status">
          {done.text}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <BookingPill status={b.status} />
        <h1 className="t1">{b.title}</h1>
      </div>
      {seat ? (
        <section className="card flex flex-col gap-3 p-5" aria-labelledby="group-h">
          <h2 id="group-h" className="t3">
            {seat.sessions.length > 1 ? `Your group: ${seat.sessions.length} weekly sessions` : "Your session"}
          </h2>
          {seat.run_status === "open" ? <p className="help">Your seat is reserved. The group is confirmed 24 hours before it starts; if too few people book, you get the full amount back as credit.</p> : null}
          {seat.run_status === "cancelled" ? (
            <p className="panel info">{seat.cancel_reason === "minimum_not_met" ? "Too few people booked, so this group did not run. The full amount is credit on your account." : "The teacher cancelled this group. The full amount is credit on your account."}</p>
          ) : null}
          <ol className="flex flex-col divide-y divide-dashed divide-line-2">
            {seat.sessions.map((s) => (
              <li key={s.sequence_no} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span>
                  <span className="mono text-ink-2">{s.sequence_no}.</span> <span className="mono">{formatDate(s.starts_at)}</span>, <span className="mono">{formatTime(s.starts_at)}</span> – <span className="mono">{formatTime(s.ends_at)}</span>
                </span>
                {s.attendance ? (
                  <span className={`pill ${s.attendance === "absent" ? "bg-error-tint text-error" : "bg-forest-tint text-forest-ink"}`}>{s.attendance === "present" ? "Present" : s.attendance === "late" ? "Late" : "Absent"}</span>
                ) : s.status === "cancelled" ? (
                  <span className="pill bg-sand text-ink-2">Cancelled</span>
                ) : null}
              </li>
            ))}
          </ol>
          {seat.meeting_link ? (
            <a className="btn2 self-start" href={seat.meeting_link} target="_blank" rel="noreferrer">
              <Video size={18} aria-hidden="true" />
              Open the group’s meeting link
            </a>
          ) : ["scheduled", "in_progress"].includes(b.status) && seat.run_status !== "cancelled" ? (
            <p className="help">The teacher adds the meeting link here before the first session.</p>
          ) : null}
        </section>
      ) : null}
      {move ? <RescheduleAnswer bookingId={b.id} proposalId={move.id} side="learner" mine={move.by_role === "payer"} newStart={move.new_starts_at} expiresAt={move.expires_at} /> : null}

      {b.status === "awaiting_payment" || b.status === "requested" ? (
        <Link className="btn self-start" href={`/checkout/${b.id}/pay`}>
          Finish paying
        </Link>
      ) : null}
      {b.status === "paid" ? (
        <p className="panel info">
          Waiting for {teacherFirst} to confirm, within 12 hours of payment.{" "}
          {b.kind === "package_session" || b.kind === "managed_plan_session"
            ? "If they cannot, the lesson goes back into your package."
            : "If they cannot, the full amount comes back to you as credit."}
        </p>
      ) : null}
      {b.status === "awaiting_confirmation" ? (
        <div className="card flex flex-col gap-3 p-5">
          <h2 className="t3">Did the lesson happen?</h2>
          <p className="help">
            Confirm and {teacherFirst} is paid. If we hear nothing within {AUTO_CONFIRM_HOURS} hours of the note, it is confirmed for you.
          </p>
          <Link className="btn self-start" href={`/bookings/${b.id}/confirm`}>
            Confirm or report a problem
          </Link>
        </div>
      ) : null}
      {b.status === "awaiting_note" ? <p className="panel info">The lesson has ended. {teacherFirst} is writing the lesson note.</p> : null}
      {b.meeting_link ? (
        <a className={b.status === "awaiting_confirmation" ? "btn2 self-start" : "btn self-start"} href={b.meeting_link} target="_blank" rel="noreferrer">
          <Video size={18} aria-hidden="true" />
          Join the lesson
        </a>
      ) : null}

      {openDispute ? (
        <Link className="panel info no-underline" href={`/disputes/${openDispute.id}`}>
          <span>
            <b>{PROBLEM_TYPES[openDispute.type] ?? "Problem reported"}</b> · {DISPUTE_STATUS_LABELS[openDispute.status] ?? openDispute.status}. Payment is on hold until
            the concierge decides.
          </span>
        </Link>
      ) : null}

      {note ? <LessonNote note={note} /> : null}

      {b.status === "confirmed" && !review ? (
        <Link className="btn2 self-start" href={`/bookings/${b.id}/review`}>
          Leave a review
        </Link>
      ) : null}
      {review ? (
        <section className="card flex flex-col gap-2 p-5" aria-label="Your review">
          <h2 className="t3">
            Your review · <span className="mono">{review.rating}/5</span>
          </h2>
          {review.body ? <p className="whitespace-pre-line">{review.body}</p> : null}
          {review.teacher_reply ? (
            <p className="help">
              {teacherFirst} replied: {review.teacher_reply}
            </p>
          ) : null}
        </section>
      ) : null}

      <BookingSummary b={b} />
      {p?.status === "succeeded" || p?.status === "refunded" || p?.status === "partially_refunded" ? (
        <p className="help">
          Paid <span className="mono">{formatKES(p.amount_kes)}</span>
          {p.succeeded_at ? (
            <>
              {" "}
              on <span className="mono">{`${formatDate(p.succeeded_at)} ${formatTime(p.succeeded_at)}`}</span>
            </>
          ) : null}{" "}
          · reference <span className="mono">{p.platform_ref}</span>
        </p>
      ) : null}

      {!openDispute && problems.length ? (
        <Link className="btn3 self-start" href={`/bookings/${b.id}/problem`}>
          {b.status === "no_show_learner" ? "We missed it for a serious reason" : b.status === "scheduled" ? "The teacher has not come" : "Report a problem"}
        </Link>
      ) : null}
      {movable && !move ? <RescheduleForm bookingId={b.id} side="learner" minDate={dayKey(new Date(now.getTime() + 86_400_000))} times={TIME_OPTIONS} /> : null}
      {cancel.kind !== "closed" ? <CancelForm bookingId={b.id} preview={cancel.text} tone={cancel.kind} /> : null}
      {["cancelled", "lapsed", "no_show_teacher"].includes(b.status) && b.paid_at ? (
        <div className="flex flex-wrap gap-4">
          <Link className="btn3" href={`/requests/replacement?booking=${b.id}`}>
            Find me a new teacher
          </Link>
          <Link className="btn3" href="/account/credits">
            See my credit
          </Link>
        </div>
      ) : null}
      <Link className="btn3 self-start" href={`/learners/${b.learner_id}/progress`}>
        {b.learner_alias}’s lesson notes
      </Link>
      {policy ? (
        <details className="card p-5">
          <summary className="cursor-pointer font-semibold">Cancellation and refunds</summary>
          <p className="mt-2 text-ink-2">{policy}</p>
        </details>
      ) : null}
    </div>
  );
}
