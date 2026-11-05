"use client";
import { useActionState } from "react";
import { BookOpen, Briefcase, Clock, Laptop, Store } from "lucide-react";
import { submitRequest, type RequestState } from "./actions";

const CATS = [
  { slug: "career", label: "Career and professional growth", Icon: Briefcase },
  { slug: "business", label: "Business and entrepreneurship", Icon: Store },
  { slug: "school", label: "School and academic subjects", Icon: BookOpen },
  { slug: "digital-practical", label: "Digital and practical skills", Icon: Laptop },
];

export function RequestForm({ initial = {}, back }: { initial?: Record<string, string>; back: string }) {
  const [state, action, pending] = useActionState<RequestState, FormData>(submitRequest, { fields: initial });
  const f = state.fields ?? initial;
  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="back" value={back} />
      <fieldset className="flex flex-col gap-2.5">
        <legend className="label mb-2">What would you like to learn?</legend>
        {CATS.map(({ slug, label, Icon }) => (
          <label key={slug} className="reply">
            <input type="radio" name="category" value={slug} defaultChecked={f.category === slug} required />
            <Icon size={22} aria-hidden="true" />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label className="label" htmlFor="need">
          Tell us what you need
        </label>
        <textarea
          id="need"
          name="need"
          className="input"
          maxLength={500}
          defaultValue={f.need ?? f.q ?? ""}
          placeholder="For example: speaking up in meetings, weekday evenings, online."
          required
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-2">Online or in person?</legend>
        <div className="flex flex-wrap gap-2">
          {[
            ["either", "Either"],
            ["online", "Online"],
            ["in_person", "In person"],
          ].map(([v, l]) => (
            <label key={v} className="option py-2.5!">
              <input type="radio" name="mode" value={v} defaultChecked={(f.mode ?? "either") === v} />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="field">
          <label className="label" htmlFor="when">
            When suits you?
          </label>
          <input id="when" name="when" className="input" defaultValue={f.when ?? ""} placeholder="Weekday evenings" />
        </div>
        <div className="field">
          <label className="label" htmlFor="county">
            County <span className="font-normal text-ink-2">(for in person)</span>
          </label>
          <input id="county" name="county" className="input" defaultValue={f.county ?? ""} placeholder="Nairobi" />
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="budget">
          Budget per session
        </label>
        <span className="sel block">
          <select id="budget" name="budget" className="select" defaultValue={f.budget ?? ""}>
            <option value="">Not sure yet</option>
            <option value="1000">Up to KES 1,000</option>
            <option value="2000">Up to KES 2,000</option>
            <option value="5000">Up to KES 5,000</option>
          </select>
        </span>
      </div>
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="btn block lg" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send request"}
      </button>
      <p className="flex items-start gap-2.5 text-[15px] leading-[22px] text-ink-2">
        <Clock size={20} aria-hidden="true" className="mt-0.5 flex-none" />A person reads every request and replies within 24
        hours, here or on WhatsApp. You only pay when you book.
      </p>
    </form>
  );
}
