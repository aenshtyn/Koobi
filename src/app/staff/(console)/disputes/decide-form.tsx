"use client";
import { useActionState, useState } from "react";
import { resolveDispute, type DecideState } from "./actions";

export function DecideForm({ disputeId, outcomes, amount, trial }: { disputeId: string; outcomes: [string, string][]; amount: number; trial: boolean }) {
  const [state, action, pending] = useActionState<DecideState, FormData>(resolveDispute, {});
  const [outcome, setOutcome] = useState("");
  return (
    <form action={action} className="card flex flex-col gap-5 p-5">
      <input type="hidden" name="dispute_id" value={disputeId} />
      <fieldset className="field">
        <legend className="label mb-2">Outcome</legend>
        <div className="flex flex-col gap-2">
          {outcomes
            .filter(([code]) => !(trial && code === "partial_refund"))
            .map(([code, label]) => (
              <label key={code} className="option">
                <input type="radio" name="outcome" value={code} required onChange={() => setOutcome(code)} />
                <span>{label}</span>
              </label>
            ))}
        </div>
      </fieldset>
      {outcome === "partial_refund" ? (
        <div className="field">
          <label className="label" htmlFor="credit_kes">
            Credit back to the payer (KES)
          </label>
          <input id="credit_kes" name="credit_kes" className="input mono max-w-48" inputMode="numeric" pattern="[0-9]*" required />
          <p className="help">
            Between <span className="mono">1</span> and <span className="mono">{amount - 1}</span>. The rest is released to the teacher with the usual fee and tax.
          </p>
        </div>
      ) : null}
      <div className="field">
        <label className="label" htmlFor="note">
          Reason, shown to both sides
        </label>
        <textarea id="note" name="note" className="input min-h-24" maxLength={1000} required minLength={10} />
      </div>
      <div className="field">
        <label className="label" htmlFor="minutes">
          Minutes you spent
        </label>
        <input id="minutes" name="minutes" className="input mono max-w-32" inputMode="numeric" pattern="[0-9]*" required />
      </div>
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="btn self-start" type="submit" disabled={pending}>
        {pending ? "Recording…" : "Record the decision"}
      </button>
    </form>
  );
}
