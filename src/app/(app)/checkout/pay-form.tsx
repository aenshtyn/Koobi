"use client";
import { useActionState } from "react";
import { payWithMpesa, type PayState } from "./actions";

export function MpesaForm({ bookingId, phone, amount }: { bookingId: string; phone: string; amount: string }) {
  const [state, action, pending] = useActionState<PayState, FormData>(payWithMpesa, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="booking_id" value={bookingId} />
      <div className="field">
        <label className="label" htmlFor="phone">
          M-Pesa number
        </label>
        <div className="inputwrap">
          <span className="pre">+254</span>
          <input id="phone" name="phone" type="tel" inputMode="tel" className="mono" defaultValue={phone} placeholder="712 345 678" required />
        </div>
        <p className="help">We send an M-Pesa prompt to this number. Enter your PIN on your phone. We never see your PIN.</p>
      </div>
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="btn pay block" type="submit" disabled={pending}>
        {pending ? "Sending the prompt…" : `Pay ${amount} with M-Pesa`}
      </button>
    </form>
  );
}
