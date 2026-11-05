"use client";
import { useActionState, useState } from "react";
import {
  cancelBooking,
  confirmLesson,
  reportProblem,
  requestCreditRefund,
  requestReplacement,
  submitReview,
  type FormState,
} from "./actions";

function ErrorLine({ error }: { error?: string }) {
  return error ? (
    <p className="field-error" role="alert">
      {error}
    </p>
  ) : null;
}

export function ConfirmForm({ bookingId, teacherFirst }: { bookingId: string; teacherFirst: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(confirmLesson, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="booking_id" value={bookingId} />
      <ErrorLine error={state.error} />
      <button className="btn lg self-start" type="submit" disabled={pending}>
        {pending ? "Confirming…" : `Yes, it happened. Pay ${teacherFirst}`}
      </button>
    </form>
  );
}

export function CancelForm({ bookingId, preview, tone }: { bookingId: string; preview: string; tone: "credit" | "released" | "free" }) {
  const [state, action, pending] = useActionState<FormState, FormData>(cancelBooking, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="btn3 self-start" type="button" onClick={() => setOpen(true)}>
        Cancel this lesson
      </button>
    );
  }
  return (
    <form action={action} className="card flex flex-col gap-4 p-5">
      <input type="hidden" name="booking_id" value={bookingId} />
      <p className={`panel ${tone === "released" ? "error" : "info"}`}>{preview}</p>
      <div className="field">
        <label className="label" htmlFor="reason">
          Reason (optional)
        </label>
        <input id="reason" name="reason" className="input" maxLength={120} placeholder="For example: travelling that week" />
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

export function ProblemForm({ bookingId, types }: { bookingId: string; types: [string, string][] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(reportProblem, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="booking_id" value={bookingId} />
      <fieldset className="field">
        <legend className="label mb-2">What went wrong</legend>
        <div className="flex flex-col gap-2">
          {types.map(([code, label], i) => (
            <label key={code} className="option">
              <input type="radio" name="type" value={code} defaultChecked={i === 0 && types.length === 1} required />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label className="label" htmlFor="description">
          What happened
        </label>
        <textarea id="description" name="description" className="input min-h-28" maxLength={2000} required minLength={10} />
        <p className="help">The concierge reads this and may ask both of you for a short statement. Payment stays on hold until they decide.</p>
      </div>
      <ErrorLine error={state.error} />
      <button className="btn self-start" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send to the concierge"}
      </button>
    </form>
  );
}

export function ReviewForm({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitReview, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="booking_id" value={bookingId} />
      <fieldset className="field">
        <legend className="label mb-2">How was it</legend>
        <div className="flex flex-wrap gap-2">
          {[5, 4, 3, 2, 1].map((n) => (
            <label key={n} className="option py-2!">
              <input type="radio" name="rating" value={n} required />
              <span className="mono">{n}</span>
              <span className="help">{n === 5 ? "excellent" : n === 1 ? "poor" : ""}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label className="label" htmlFor="body">
          What would you tell another learner? (optional)
        </label>
        <textarea id="body" name="body" className="input min-h-28" maxLength={2000} />
        <p className="help">Shown on the offer with your first name. The teacher can reply once.</p>
      </div>
      <ErrorLine error={state.error} />
      <button className="btn self-start" type="submit" disabled={pending}>
        {pending ? "Posting…" : "Post the review"}
      </button>
    </form>
  );
}

export function ReplacementForm({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestReplacement, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="booking_id" value={bookingId} />
      <div className="field">
        <label className="label" htmlFor="note">
          Anything the new teacher should know (optional)
        </label>
        <textarea id="note" name="note" className="input min-h-24" maxLength={400} placeholder="For example: evenings after 6 work best" />
      </div>
      <ErrorLine error={state.error} />
      <button className="btn self-start" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Find me a new teacher"}
      </button>
    </form>
  );
}

export function CreditRefundForm({ paymentId, label }: { paymentId: string; label: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestCreditRefund, {});
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="payment_id" value={paymentId} />
      <button className="btn2" type="submit" disabled={pending}>
        {pending ? "Sending…" : label}
      </button>
      <ErrorLine error={state.error} />
    </form>
  );
}
