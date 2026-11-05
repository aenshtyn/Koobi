"use client";
import { useActionState, useState } from "react";
import { respondToBooking, type RespondState } from "./actions";

export function RespondForm({ bookingId, mode }: { bookingId: string; mode: string }) {
  const [state, action, pending] = useActionState<RespondState, FormData>(respondToBooking, {});
  const [declining, setDeclining] = useState(false);
  return (
    <form action={action} className="card flex flex-col gap-4 p-5">
      <input type="hidden" name="booking_id" value={bookingId} />
      <input type="hidden" name="mode" value={mode} />
      {declining ? (
        <div className="field">
          <label className="label" htmlFor="reason">
            Why you cannot take it
          </label>
          <textarea id="reason" name="reason" className="input" maxLength={200} required placeholder="For example: I am travelling that week." />
          <p className="help">The learner gets every shilling back as credit.</p>
        </div>
      ) : mode === "online" ? (
        <div className="field">
          <label className="label" htmlFor="meeting_link">
            Meeting link
          </label>
          <input id="meeting_link" name="meeting_link" className="input mono" placeholder="https://meet.google.com/abc-defg-hij" required />
          <p className="help">Google Meet or Zoom. The learner sees it once you accept.</p>
        </div>
      ) : null}
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {declining ? (
          <>
            <button className="btn2" type="submit" name="decision" value="decline" disabled={pending}>
              Decline the booking
            </button>
            <button className="btn3" type="button" onClick={() => setDeclining(false)}>
              Back
            </button>
          </>
        ) : (
          <>
            <button className="btn lg" type="submit" name="decision" value="accept" disabled={pending}>
              {pending ? "Saving…" : "Accept the booking"}
            </button>
            <button className="btn3" type="button" onClick={() => setDeclining(true)}>
              I cannot take it
            </button>
          </>
        )}
      </div>
    </form>
  );
}
