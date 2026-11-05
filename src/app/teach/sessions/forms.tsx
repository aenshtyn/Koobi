"use client";
import { useActionState, useState } from "react";
import { fileNote, lessonStep, replyToReview, teacherCancel, type FormState } from "./actions";

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
  const [state, action, pending] = useActionState<FormState, FormData>(fileNote, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="session_id" value={sessionId} />
      <div className="field">
        <label className="label" htmlFor="covered">
          What you covered
        </label>
        <textarea id="covered" name="covered" className="input min-h-28" maxLength={4000} required minLength={10} />
      </div>
      <div className="field">
        <label className="label" htmlFor="progress">
          How they are progressing (optional)
        </label>
        <textarea id="progress" name="progress" className="input min-h-20" maxLength={4000} />
      </div>
      <div className="field">
        <label className="label" htmlFor="next_steps">
          Next time, or practice before then (optional)
        </label>
        <textarea id="next_steps" name="next_steps" className="input min-h-20" maxLength={4000} />
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
  const [state, action, pending] = useActionState<FormState, FormData>(teacherCancel, {});
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
        <input id="cancel-reason" name="reason" className="input" maxLength={200} required minLength={5} />
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
  const [state, action, pending] = useActionState<FormState, FormData>(replyToReview, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="review_id" value={reviewId} />
      <label className="label" htmlFor={`reply-${reviewId}`}>
        Your reply (once, shown under the review)
      </label>
      <textarea id={`reply-${reviewId}`} name="reply" className="input min-h-20" maxLength={1000} required />
      <ErrorLine error={state.error} />
      <button className="btn2 self-start" type="submit" disabled={pending}>
        {pending ? "Posting…" : "Post the reply"}
      </button>
    </form>
  );
}
