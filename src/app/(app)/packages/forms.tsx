"use client";
import { useActionState } from "react";
import { bookFromPackage, createPackage, payPackage, type PkgState } from "./actions";

function ErrorLine({ error }: { error?: string }) {
  return error ? (
    <p className="field-error" role="alert">
      {error}
    </p>
  ) : null;
}

export function NewPackageForm(props: {
  offeringId: string;
  sizes: { sessions: number; label: string }[];
  learners: { value: string; label: string }[];
  plan?: "standard" | "managed";
  previousId?: string;
  cta: string;
}) {
  const [state, action, pending] = useActionState<PkgState, FormData>(createPackage, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="offering_id" value={props.offeringId} />
      <input type="hidden" name="plan" value={props.plan ?? "standard"} />
      {props.previousId ? <input type="hidden" name="previous_package_id" value={props.previousId} /> : null}
      <fieldset className="field">
        <legend className="label mb-2">How many lessons</legend>
        <div className="flex flex-col gap-2">
          {props.sizes.map((s, i) => (
            <label key={s.sessions} className="option">
              <input type="radio" name="sessions" value={s.sessions} defaultChecked={i === 0} required />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label className="label" htmlFor="cadence">
            Lessons a week
          </label>
          <select id="cadence" name="cadence" className="input" defaultValue="2">
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        {props.learners.length > 1 ? (
          <div className="field">
            <label className="label" htmlFor="learner">
              Who is learning
            </label>
            <select id="learner" name="learner" className="input" defaultValue={props.learners[0].value}>
              {props.learners.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <input type="hidden" name="learner" value={props.learners[0]?.value ?? "self"} />
        )}
      </div>
      <p className="help">The package lasts its lessons at this pace plus two weeks. Money is held and paid to the teacher one lesson at a time.</p>
      <ErrorLine error={state.error} />
      <button className="btn self-start" type="submit" disabled={pending}>
        {pending ? "Saving…" : props.cta}
      </button>
    </form>
  );
}

export function PackagePayForm({ packageId, phone, amount }: { packageId: string; phone: string; amount: string }) {
  const [state, action, pending] = useActionState<PkgState, FormData>(payPackage, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="package_id" value={packageId} />
      <div className="field">
        <label className="label" htmlFor="phone">
          M-Pesa number
        </label>
        <div className="inputwrap">
          <span className="pre">+254</span>
          <input id="phone" name="phone" type="tel" inputMode="tel" className="mono" defaultValue={phone} placeholder="712 345 678" required />
        </div>
      </div>
      <ErrorLine error={state.error} />
      <button className="btn pay block" type="submit" disabled={pending}>
        {pending ? "Sending the prompt…" : `Pay ${amount} with M-Pesa`}
      </button>
    </form>
  );
}

export function BookLessonForm({ packageId, slots, modes }: { packageId: string; slots: { value: string; label: string }[]; modes: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState<PkgState, FormData>(bookFromPackage, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="package_id" value={packageId} />
      <fieldset className="field">
        <legend className="label mb-2">Choose a time</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {slots.map((s) => (
            <label key={s.value} className="option">
              <input type="radio" name="slot" value={s.value} required />
              <span className="mono">{s.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {modes.length > 1 ? (
        <div className="field">
          <label className="label" htmlFor="mode">
            Where
          </label>
          <select id="mode" name="mode" className="input max-w-72" defaultValue={modes[0].value}>
            {modes.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="mode" value={modes[0]?.value ?? "online"} />
      )}
      <ErrorLine error={state.error} />
      <button className="btn self-start" type="submit" disabled={pending}>
        {pending ? "Booking…" : "Book this lesson"}
      </button>
    </form>
  );
}
