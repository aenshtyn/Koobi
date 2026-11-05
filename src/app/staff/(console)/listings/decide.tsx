"use client";
import { useActionState, useState } from "react";
import { decideListing, type DecideState } from "./actions";

export function Decide({ kind, id, label }: { kind: "teacher" | "offer"; id: string; label: string }) {
  const [state, action, pending] = useActionState<DecideState, FormData>(decideListing, {});
  const [rejecting, setRejecting] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      {rejecting ? (
        <div className="field">
          <label className="label" htmlFor={`reason-${id}`}>
            What needs to change
          </label>
          <textarea id={`reason-${id}`} name="reason" className="input" maxLength={1000} required placeholder="For example: the price is per session, not per hour. Please also add what learners will work on." />
          <p className="help">The teacher sees this exactly as written.</p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {rejecting ? (
          <>
            <button className="btn2" type="submit" name="decision" value="reject" disabled={pending}>
              {pending ? "Sending…" : `Send back ${label}`}
            </button>
            <button className="btn3" type="button" onClick={() => setRejecting(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="btn2" type="submit" name="decision" value="approve" disabled={pending}>
              {pending ? "Approving…" : `Approve ${label}`}
            </button>
            <button className="btn3" type="button" onClick={() => setRejecting(true)}>
              Ask for changes
            </button>
          </>
        )}
      </div>
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
