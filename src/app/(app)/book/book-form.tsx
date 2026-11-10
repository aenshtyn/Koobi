"use client";
import { useActionState } from "react";
import { createBooking, type BookState } from "./actions";

type Option = { value: string; label: string; sub?: string; price?: string };

export function BookForm(props: {
  slug: string;
  kinds: Option[];
  slots: Option[];
  learners: Option[];
  modes: Option[];
  policy: string;
  /** For a group: the dates to choose from, in place of times. */
  slotLegend?: string;
  noSlots?: string;
}) {
  const [state, action, pending] = useActionState<BookState, FormData>(createBooking, {});
  return (
    <form action={action} className="flex flex-col gap-7">
      <input type="hidden" name="slug" value={props.slug} />
      <fieldset className="flex flex-col gap-2.5">
        <legend className="label mb-2">What to book</legend>
        {props.kinds.map((k, i) => (
          <label key={k.value} className="option">
            <input type="radio" name="kind" value={k.value} defaultChecked={i === 0} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">{k.label}</span>
              {k.sub ? <span className="help">{k.sub}</span> : null}
            </span>
            {k.price ? <span className="price">{k.price}</span> : null}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-2.5">
        <legend className="label mb-2">{props.slotLegend ?? "Time (Nairobi)"}</legend>
        {props.slots.length ? (
          <div className="flex flex-wrap gap-2">
            {props.slots.map((s, i) => (
              <label key={s.value} className="option py-2.5!">
                <input type="radio" name="slot" value={s.value} defaultChecked={i === 0} required />
                <span className="mono">{s.label}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="empty">{props.noSlots ?? "No open times in the next two weeks. Message the teacher or request a match."}</p>
        )}
      </fieldset>
      {props.learners.length > 1 ? (
        <fieldset className="flex flex-col gap-2.5">
          <legend className="label mb-2">Who is learning</legend>
          {props.learners.map((l, i) => (
            <label key={l.value} className="check">
              <input type="radio" name="learner" value={l.value} defaultChecked={i === 0} />
              {l.label}
            </label>
          ))}
        </fieldset>
      ) : (
        <input type="hidden" name="learner" value="self" />
      )}
      {props.modes.length > 1 ? (
        <fieldset className="flex flex-col gap-2.5">
          <legend className="label mb-2">Where</legend>
          {props.modes.map((m, i) => (
            <label key={m.value} className="check">
              <input type="radio" name="mode" value={m.value} defaultChecked={i === 0} />
              {m.label}
            </label>
          ))}
        </fieldset>
      ) : (
        <input type="hidden" name="mode" value={props.modes[0]?.value ?? "online"} />
      )}
      <div className="field">
        <label className="label" htmlFor="learner_note">
          A note for the teacher <span className="font-normal text-ink-2">(optional)</span>
        </label>
        <textarea id="learner_note" name="learner_note" className="input" maxLength={500} placeholder="What you want to work on, or anything the teacher should know before the first lesson." />
        <p className="help">The teacher sees this with the booking. Do not add phone numbers or email addresses.</p>
      </div>
      <div className="card flex flex-col gap-3 p-5">
        <h2 className="t3">Cancellation and refunds</h2>
        <p className="text-[15px] leading-[23px] text-ink-2">{props.policy}</p>
        <label className="check items-start!">
          <input type="checkbox" name="ack" className="mt-0.5" required />
          <span>I have read this.</span>
        </label>
      </div>
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="btn block lg" type="submit" disabled={pending || !props.slots.length}>
        {pending ? "Holding your time…" : "Continue to payment"}
      </button>
      <p className="text-center text-sm text-ink-2">Pay only when the lesson happens: the money is held until then.</p>
    </form>
  );
}
