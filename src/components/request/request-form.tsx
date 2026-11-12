"use client";
import { useActionState } from "react";
import { ArrowRight, BookOpen, Briefcase, Clock, Laptop, Mail, Phone, Store, UserRound } from "lucide-react";
import { BUDGETS, DAYS, FORMAT_CHOICES, TIMES, TIME_LABELS } from "@/domain/request-form";
import { formatKES } from "@/domain/format";
import { submitRequest, type RequestState } from "./actions";

const CATS = [
  { slug: "career", label: "Career and professional growth", Icon: Briefcase },
  { slug: "business", label: "Business and entrepreneurship", Icon: Store },
  { slug: "school", label: "School and academic subjects", Icon: BookOpen },
  { slug: "digital-practical", label: "Digital and practical skills", Icon: Laptop },
];

/** A pill that is a checkbox or radio underneath: dark when chosen, with a visible keyboard focus. */
const PILL =
  "chip cursor-pointer has-checked:border-ink has-checked:bg-ink has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-orange";

function Step({ n, children, id }: { n: number; children: React.ReactNode; id?: string }) {
  return (
    <span id={id} className="flex items-center gap-2.5 text-[18px] leading-[24px] font-semibold">
      <span className="stepn h-[30px]! w-[32px]! text-[15px]!" aria-hidden="true">
        {n}
      </span>
      {children}
    </span>
  );
}

export function RequestForm({ initial = {}, signedIn = false }: { initial?: Record<string, string>; signedIn?: boolean }) {
  const [state, action, pending] = useActionState<RequestState, FormData>(submitRequest, { fields: initial });
  const f = state.fields ?? initial;
  const times = (f.times ?? "").split(",");
  const days = (f.days ?? "").split(",");
  // Uncontrolled inputs keep what was typed; the key makes radios and ticks follow the echoed values.
  const echo = JSON.stringify([f.category, f.format, f.times, f.days, f.budget, f.consent]);
  return (
    <form action={action} className="flex flex-col gap-7">
      <fieldset key={`c${echo}`} className="flex flex-col gap-3">
        <legend className="mb-3">
          <Step n={1}>What would you like to learn?</Step>
        </legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {CATS.map(({ slug, label, Icon }) => (
            <label key={slug} className="reply">
              <input type="radio" name="category" value={slug} defaultChecked={f.category === slug} required />
              <Icon size={22} aria-hidden="true" className="flex-none" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="need">
          <Step n={2}>Tell us what you need</Step>
        </label>
        <textarea
          id="need"
          name="need"
          className="input"
          minLength={10}
          maxLength={500}
          defaultValue={f.need ?? f.q ?? ""}
          placeholder="e.g. I want English lessons to improve my business communication."
          required
        />
      </div>

      <fieldset key={`f${echo}`} className="flex flex-col">
        <legend className="mb-3">
          <Step n={3}>What type of learning do you prefer?</Step>
        </legend>
        <div className="flex flex-wrap gap-2">
          {FORMAT_CHOICES.map(([v, l]) => (
            <label key={v} className={PILL}>
              <input type="radio" name="format" value={v} defaultChecked={(f.format || "unsure") === v} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>

      <div key={`w${echo}`} className="flex flex-col gap-4">
        <Step n={4}>When suits you?</Step>
        <div role="group" aria-label="Preferred time" className="flex flex-wrap items-center gap-2">
          <span className="label w-[126px]" aria-hidden="true">
            Preferred time
          </span>
          {TIMES.map((t) => (
            <label key={t} className={PILL}>
              <input type="checkbox" name="times" value={t} defaultChecked={times.includes(t)} className="sr-only" />
              {TIME_LABELS[t]}
            </label>
          ))}
        </div>
        <div role="group" aria-label="Preferred days" className="flex flex-wrap items-center gap-2">
          <span className="label w-[126px]" aria-hidden="true">
            Preferred days
          </span>
          {DAYS.map(([v, l]) => (
            <label key={v} className={PILL}>
              <input type="checkbox" name="days" value={v} defaultChecked={days.includes(v)} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label className="label w-[126px]" htmlFor="budget">
            Budget per session
          </label>
          <span className="sel block min-w-[220px] flex-1">
            <select id="budget" name="budget" className="select" defaultValue={f.budget ?? ""}>
              {BUDGETS.map((b) => (
                <option key={b} value={b}>
                  {b ? `Up to ${formatKES(Number(b))}` : "Not sure yet"}
                </option>
              ))}
            </select>
          </span>
        </div>
      </div>

      <fieldset className="flex flex-col">
        <legend className="mb-1">
          <Step n={5}>Your contact details</Step>
        </legend>
        <p className="help mb-3">Where should we send your recommendations?</p>
        <div className="grid gap-3 md:grid-cols-[1fr_1.25fr_1fr]">
          <div className="inputwrap h-[52px]!">
            <span className="pre border-r-0! pr-0!">
              <UserRound size={18} aria-hidden="true" />
            </span>
            <input name="name" aria-label="Full name" placeholder="Full name" autoComplete="name" defaultValue={f.name ?? ""} maxLength={80} className="text-[16px]!" required />
          </div>
          <div className="inputwrap h-[52px]!">
            <span className="pre border-r-0! pr-0!">
              <Mail size={18} aria-hidden="true" />
            </span>
            <input name="email" type="email" inputMode="email" aria-label="Email address" placeholder="Email address" autoComplete="email" defaultValue={f.email ?? ""} className="text-[16px]!" readOnly={signedIn && !!initial.email} required />
          </div>
          <div className="inputwrap h-[52px]!">
            <span className="pre border-r-0! pr-0!">
              <Phone size={18} aria-hidden="true" />
            </span>
            <input name="phone" type="tel" inputMode="tel" aria-label="Phone number (optional)" placeholder="Phone (optional)" autoComplete="tel" defaultValue={f.phone ?? ""} className="mono text-[16px]!" />
          </div>
        </div>
      </fieldset>

      {/* Left empty by people; filled in by scripts. */}
      <div className="hidden" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label key={`k${echo}`} className="check items-start!">
        <input type="checkbox" name="consent" defaultChecked={f.consent === "on"} required className="mt-0.5" />
        <span>I agree to Koobi using my information to identify suitable learning experiences and contact me about my request.</span>
      </label>

      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="btn block lg" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Find my match"}
        {pending ? null : <ArrowRight size={20} aria-hidden="true" className="ml-2 inline align-[-4px]" />}
      </button>
      <p className="flex items-start justify-center gap-2.5 text-center text-[15px] leading-[22px] text-ink-2">
        <Clock size={20} aria-hidden="true" className="mt-0.5 flex-none" />
        <span>
          Our team reviews your request and sends suitable recommendations within 24 hours.
          <br />
          You only pay when you book.
        </span>
      </p>
    </form>
  );
}
