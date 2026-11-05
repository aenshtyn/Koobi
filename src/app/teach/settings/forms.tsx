"use client";
import { useActionState } from "react";
import { saveKraPin, savePayoutNumber, type SState } from "./actions";

function ErrorLine({ error }: { error?: string }) {
  return error ? (
    <p className="field-error" role="alert">
      {error}
    </p>
  ) : null;
}

export function KraForm({ saved }: { saved: string | null }) {
  const [state, action, pending] = useActionState<SState, FormData>(saveKraPin, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="field">
        <label className="label" htmlFor="kra_pin">
          KRA PIN
        </label>
        <input id="kra_pin" name="kra_pin" className="input mono max-w-64 uppercase" placeholder="A012345678Z" autoComplete="off" required />
        {saved ? <p className="help">Saved: <span className="mono">{saved}</span></p> : null}
        <p className="help">Needed before any payout: Koobi deducts 5% withholding tax and files it against this PIN.</p>
      </div>
      <ErrorLine error={state.error} />
      <button className="btn2 self-start" type="submit" disabled={pending}>
        {pending ? "Saving…" : saved ? "Replace the PIN" : "Save the PIN"}
      </button>
    </form>
  );
}

export function PayoutForm({ saved }: { saved: string | null }) {
  const [state, action, pending] = useActionState<SState, FormData>(savePayoutNumber, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="field">
        <label className="label" htmlFor="phone">
          M-Pesa number for payouts
        </label>
        <div className="inputwrap max-w-72">
          <span className="pre">+254</span>
          <input id="phone" name="phone" type="tel" className="mono" inputMode="tel" placeholder="712 345 678" autoComplete="off" required />
        </div>
        {saved ? <p className="help">Saved: <span className="mono">{saved}</span></p> : null}
        <p className="help">A new number pauses payouts until a small test payout proves it is yours.</p>
      </div>
      <ErrorLine error={state.error} />
      <button className="btn2 self-start" type="submit" disabled={pending}>
        {pending ? "Saving…" : saved ? "Change the number" : "Save the number"}
      </button>
    </form>
  );
}
