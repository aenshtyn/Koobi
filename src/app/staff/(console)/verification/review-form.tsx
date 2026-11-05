"use client";
import { useEchoAction } from "@/lib/use-echo-action";
import { reviewCheck, type ReviewState } from "./actions";

export function ReviewForm({ checkId, expires }: { checkId: string; expires: boolean }) {
  const [state, action, pending] = useEchoAction<ReviewState>(reviewCheck, {});
  return (
    <form action={action} className="card flex flex-col gap-4 p-5">
      <input type="hidden" name="check_id" value={checkId} />
      <div className="field">
        <label className="label" htmlFor="note">
          Note (the teacher sees it if the check does not pass)
        </label>
        <textarea id="note" name="note" className="input min-h-20" maxLength={300} defaultValue={state.values?.note} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label className="label" htmlFor="minutes">
            Minutes you spent
          </label>
          <input id="minutes" name="minutes" className="input mono" inputMode="numeric" pattern="[0-9]*" required defaultValue={state.values?.minutes} />
        </div>
        {expires ? (
          <div className="field">
            <label className="label" htmlFor="expires_on">
              Valid until (if it expires)
            </label>
            <input id="expires_on" name="expires_on" type="date" className="input mono" defaultValue={state.values?.expires_on} />
          </div>
        ) : null}
      </div>
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button className="btn" type="submit" name="decision" value="pass" disabled={pending}>
          Pass
        </button>
        <button className="btn2" type="submit" name="decision" value="fail" disabled={pending}>
          Not passed
        </button>
      </div>
    </form>
  );
}
