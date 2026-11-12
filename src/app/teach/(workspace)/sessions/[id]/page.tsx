import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Video } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { BookingPill } from "@/components/app/booking-pill";
import { LessonNote } from "@/components/app/lesson-note";
import { getTeachSession } from "@/lib/data/lessons";
import { GRACE_MINUTES, KIND_LABELS, checkinWindow, graceOver } from "@/domain/booking";
import { formatDuration, formatTime, formatWeekday } from "@/domain/format";
import { StepForm } from "../forms";

export const metadata: Metadata = { title: "Lesson" };

const DONE: Record<string, string> = {
  in: "Checked in. Check out when the lesson ends.",
  absent: "Recorded. If there is no exception request within 48 hours, you are paid for the lesson.",
  note: "Note filed. The learner is asked to confirm; payment is released when they do, or after 48 hours.",
};

/** T19: check in and out (FR-SESS-2). Check-in opens ten minutes before the start. */
export default function TeachSessionPage(props: PageProps<"/teach/sessions/[id]">) {
  return (
    <Guarded next="/teach/bookings">
      <Lesson params={props.params} searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Lesson({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const found = await getTeachSession(id);
  if (!found) notFound();
  const { session: s, booking: b, note } = found;
  const now = new Date();
  const win = checkinWindow(s.starts_at, s.ends_at, now);
  const done = typeof sp.done === "string" ? DONE[sp.done] : undefined;
  return (
    <div className="flex max-w-[620px] flex-col gap-6">
      <Link className="btn3 self-start" href={`/teach/bookings/${b.id}`}>
        Booking details
      </Link>
      {done ? (
        <p className="panel escrow" role="status">
          {done}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <BookingPill status={b.status} />
        <h1 className="t1">
          {KIND_LABELS[b.kind]} with {b.learner_alias}
        </h1>
        <p className="text-ink-2">
          {b.title} · <span className="mono">{formatWeekday(s.starts_at)} {formatTime(s.starts_at)}</span> · {formatDuration(b.duration_minutes)}
        </p>
      </div>

      {s.status === "scheduled" ? (
        win.state === "early" ? (
          <p className="panel info">
            Check-in opens at <span className="mono">{formatWeekday(win.opensAt.toISOString())} {formatTime(win.opensAt.toISOString())}</span>, ten minutes before the start.
          </p>
        ) : win.state === "open" ? (
          <StepForm sessionId={s.id} step="in" label="Check in" />
        ) : (
          <p className="panel error">This lesson ended without a check-in. Message the concierge if it took place.</p>
        )
      ) : null}

      {b.meeting_link && ["scheduled", "in_progress"].includes(s.status) ? (
        <a className="btn2 self-start" href={b.meeting_link} target="_blank" rel="noreferrer">
          <Video size={18} aria-hidden="true" />
          Open the meeting link
        </a>
      ) : null}

      {s.status === "in_progress" ? (
        <div className="flex flex-col gap-4">
          <p className="help">
            Checked in at <span className="mono">{s.checked_in_at ? formatTime(s.checked_in_at) : "—"}</span>.
          </p>
          <StepForm sessionId={s.id} step="out" label="Check out and write the note" />
          {graceOver(s.starts_at, now) ? (
            <div className="card flex flex-col gap-2 p-5">
              <p className="font-semibold">The learner has not come?</p>
              <p className="help">After {GRACE_MINUTES} minutes you can report it. You are paid for the lesson unless the concierge grants an exception.</p>
              <StepForm sessionId={s.id} step="absent" label="The learner did not come" primary={false} />
            </div>
          ) : (
            <p className="help">If the learner does not come, you can report it {GRACE_MINUTES} minutes after the start.</p>
          )}
        </div>
      ) : null}

      {s.status === "awaiting_note" ? (
        <Link className="btn self-start" href={`/teach/sessions/${s.id}/note`}>
          Write the lesson note
        </Link>
      ) : null}
      {s.status === "awaiting_confirmation" ? <p className="panel info">Waiting for the learner to confirm. If they do not answer, it is confirmed after 48 hours.</p> : null}
      {s.status === "confirmed" ? (
        <p className="panel escrow">
          Confirmed{s.confirmed_by === "auto" ? " automatically" : s.confirmed_by === "staff" ? " by the concierge" : " by the learner"}. It is in your next weekly payout.
        </p>
      ) : null}
      {s.status === "disputed" ? <p className="panel error">The learner reported a problem. The concierge may ask you for a short statement.</p> : null}

      {s.actual_minutes ? (
        <p className="help">
          Logged <span className="mono">{formatDuration(s.actual_minutes)}</span> between check-in and check-out.
        </p>
      ) : null}
      {note ? <LessonNote note={note} heading="Your note" /> : null}
    </div>
  );
}
