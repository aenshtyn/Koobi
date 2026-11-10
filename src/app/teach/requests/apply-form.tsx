"use client";
import { useActionState } from "react";
import { PITCH_MAX } from "@/domain/matching";
import { applyToRequest, type ApplyState } from "./actions";

export function ApplyForm({ requestId, offers }: { requestId: string; offers: { id: string; title: string; price: number | null }[] }) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(applyToRequest, {});
  const v = state.values ?? {};
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="request_id" value={requestId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-2">Which learning experience?</legend>
        {offers.map((o, i) => (
          <label key={o.id} className="check">
            <input type="radio" name="offering_id" value={o.id} defaultChecked={v.offering_id ? v.offering_id === o.id : i === 0} />
            {o.title}
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label className="label" htmlFor="pitch">
          Why you are a good fit
        </label>
        <textarea id="pitch" name="pitch" className="input" maxLength={PITCH_MAX} defaultValue={v.pitch} required placeholder="I run site meetings in English every week and can work evenings." />
        <p className="help">Up to {PITCH_MAX} characters. No phone numbers or links.</p>
      </div>
      <div className="field max-w-[320px]">
        <label className="label" htmlFor="price">
          Your price per hour for this learner
        </label>
        <div className="inputwrap">
          <span className="pre">KES</span>
          <input id="price" name="price" inputMode="numeric" className="mono" defaultValue={v.price ?? String(offers[0]?.price ?? "")} required />
        </div>
      </div>
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="btn lg self-start" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Apply"}
      </button>
    </form>
  );
}
