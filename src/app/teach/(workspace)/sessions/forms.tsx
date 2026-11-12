"use client";
import { useActionState, useState } from "react";
import { useEchoAction } from "@/lib/use-echo-action";
import { CalendarClock, Check } from "lucide-react";
import { formatTime, formatWeekday } from "@/domain/format";
import { answerReschedule, fileNote, lessonStep, proposeReschedule, replyToReview, saveBookingNote, teacherCancel, type FormState } from "./actions";

function ErrorLine({ error }: { error?: string }) {
  return error ? (
    <p className="field-error" role="alert">
      {error}
    </p>
  ) : null;
}

/** One lesson-day button: check in, check out, or report the learner absent. */
export function StepForm({ sessionId, step, label, primary = true }: { sessionId: string; step: "in" | "out" | "absent"; label: string; primary?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(lessonStep, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="step" value={step} />
      <button className={primary ? "btn lg self-start" : "btn2 self-start"} type="submit" disabled={pending}>
        {pending ? "Saving…" : label}
      </button>
      <ErrorLine error={state.error} />
    </form>
  );
}

export function NoteForm({ sessionId }: { sessionId: string }) {
  const [state, action, pending] = useEchoAction<FormState>(fileNote, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="session_id" value={sessionId} />
      <div className="field">
        <label className="label" htmlFor="covered">
          What you covered
        </label>
        <textarea id="covered" name="covered" className="input min-h-28" maxLength={4000} required minLength={10} defaultValue={state.values?.covered} />
      </div>
      <div className="field">
        <label className="label" htmlFor="progress">
          How they are progressing (optional)
        </label>
        <textarea id="progress" name="progress" className="input min-h-20" maxLength={4000} defaultValue={state.values?.progress} />
      </div>
      <div className="field">
        <label className="label" htmlFor="next_steps">
          Next time, or practice before then (optional)
        </label>
        <textarea id="next_steps" name="next_steps" className="input min-h-20" maxLength={4000} defaultValue={state.values?.next_steps} />
        <p className="help">The learner and whoever pays see this note. Payment is released once they confirm, or automatically after 48 hours.</p>
      </div>
      <ErrorLine error={state.error} />
      <button className="btn self-start" type="submit" disabled={pending}>
        {pending ? "Saving…" : "File the note"}
      </button>
    </form>
  );
}

export function TeacherCancelForm({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useEchoAction<FormState>(teacherCancel, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="btn3 self-start" type="button" onClick={() => setOpen(true)}>
        I cannot teach this lesson
      </button>
    );
  }
  return (
    <form action={action} className="card flex flex-col gap-4 p-5">
      <input type="hidden" name="booking_id" value={bookingId} />
      <p className="panel error">The learner gets the full amount back as credit, and the cancellation counts on your reliability record.</p>
      <div className="field">
        <label className="label" htmlFor="cancel-reason">
          Why you cannot teach it
        </label>
        <input id="cancel-reason" name="reason" className="input" maxLength={200} required minLength={5} defaultValue={state.values?.reason} />
      </div>
      <ErrorLine error={state.error} />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn2" type="submit" disabled={pending}>
          {pending ? "Cancelling…" : "Cancel the lesson"}
        </button>
        <button className="btn3" type="button" onClick={() => setOpen(false)}>
          Keep it
        </button>
      </div>
    </form>
  );
}

export function ReplyForm({ reviewId }: { reviewId: string }) {
  const [state, action, pending] = useEchoAction<FormState>(replyToReview, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="review_id" value={reviewId} />
      <label className="label" htmlFor={`reply-${reviewId}`}>
        Your reply (once, shown under the review)
      </label>
      <textarea id={`reply-${reviewId}`} name="reply" className="input min-h-20" maxLength={1000} required defaultValue={state.values?.reply} />
      <ErrorLine error={state.error} />
      <button className="btn2 self-start" type="submit" disabled={pending}>
        {pending ? "Posting…" : "Post the reply"}
      </button>
    </form>
  );
}

/** The expert's own notes on a booking. The learner never sees them. */
export function InternalNoteForm({ bookingId, note }: { bookingId: string; note: string }) {
  const [state, action, pending] = useActionState<FormState & { saved?: boolean }, FormData>(saveBookingNote, {});
  // Held in state so the text stays in the box after saving (a saved form is otherwise cleared).
  const [body, setBody] = useState(note);
  return (
    <form action={action} className="flex flex-col gap-2.5">
      <input type="hidden" name="booking_id" value={bookingId} />
      <textarea name="body" aria-label="Your private notes" className="input min-h-[88px]!" maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add your notes here. Only you can see them." />
      <ErrorLine error={state.error} />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn2 ink" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save notes"}
        </button>
        {state.saved && !pending ? (
          <span className="flex items-center gap-1.5 text-[15px] text-forest-ink" role="status">
            <Check size={16} aria-hidden="true" />
            Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}

/** Ask to move a lesson to another time. The other side has six hours to accept. */
export function RescheduleForm({ bookingId, side, minDate, times }: { bookingId: string; side: "teacher" | "learner"; minDate: string; times: string[] }) {
  const [state, action, pending] = useEchoAction<FormState>(proposeReschedule, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="btn2" type="button" onClick={() => setOpen(true)}>
        <CalendarClock size={18} aria-hidden="true" />
        Move this lesson
      </button>
    );
  }
  return (
    <form action={action} className="card flex w-full flex-col gap-4 p-5">
      <input type="hidden" name="booking_id" value={bookingId} />
      <input type="hidden" name="side" value={side} />
      <h3 className="t3">Move this lesson</h3>
      <p className="help">
        {side === "teacher" ? "The learner" : "The teacher"} has 6 hours to accept. Until then the lesson stays where it is, and the money on hold does not change.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label className="label" htmlFor={`move-date-${bookingId}`}>
            New date
          </label>
          <input id={`move-date-${bookingId}`} name="date" type="date" className="input" min={minDate} required defaultValue={state.values?.date} />
        </div>
        <div className="field">
          <label className="label" htmlFor={`move-time-${bookingId}`}>
            New start time
          </label>
          <span className="sel block">
            <select id={`move-time-${bookingId}`} name="time" className="select" required defaultValue={state.values?.time ?? ""}>
              <option value="" disabled>
                Choose a time
              </option>
              {times.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </span>
          <p className="help">East Africa Time</p>
        </div>
      </div>
      <ErrorLine error={state.error} />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Sending…" : "Ask to move it"}
        </button>
        <button className="btn3" type="button" onClick={() => setOpen(false)}>
          Keep the time
        </button>
      </div>
    </form>
  );
}

/** An open request to move a lesson: the asker can withdraw it, the other side accepts or declines. */
export function RescheduleAnswer({ bookingId, proposalId, side, mine, newStart, expiresAt }: { bookingId: string; proposalId: string; side: "teacher" | "learner"; mine: boolean; newStart: string; expiresAt: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(answerReschedule, {});
  return (
    <form action={action} className="flex flex-col gap-3 rounded-[14px] bg-orange-wash px-4 py-3.5 shadow-[inset_0_0_0_1.5px_var(--orange)]">
      <input type="hidden" name="booking_id" value={bookingId} />
      <input type="hidden" name="proposal_id" value={proposalId} />
      <input type="hidden" name="side" value={side} />
      <p className="flex items-start gap-2.5">
        <CalendarClock size={20} aria-hidden="true" className="mt-0.5 flex-none text-orange" />
        <span>
          <b className="font-semibold">{mine ? "You asked to move this lesson" : side === "teacher" ? "The learner asks to move this lesson" : "The teacher asks to move this lesson"}</b> to{" "}
          <span className="mono">
            {formatWeekday(newStart)}, {formatTime(newStart)}
          </span>
          . {mine ? "Waiting for an answer until" : "Answer by"} <span className="mono">{formatTime(expiresAt)}</span>; after that it stays where it is.
        </span>
      </p>
      <ErrorLine error={state.error} />
      <div className="flex flex-wrap items-center gap-3">
        {mine ? (
          <button className="btn2 ink" type="submit" name="answer" value="withdraw" disabled={pending}>
            Withdraw the request
          </button>
        ) : (
          <>
            <button className="btn" type="submit" name="answer" value="accept" disabled={pending}>
              Accept the new time
            </button>
            <button className="btn2 ink" type="submit" name="answer" value="decline" disabled={pending}>
              Keep the old time
            </button>
          </>
        )}
      </div>
    </form>
  );
}
