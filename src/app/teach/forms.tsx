"use client";
import { useActionState } from "react";
import { CATEGORIES } from "@/domain/taxonomy";
import { EMPLOYMENT, LANGUAGES, TEACHER_TYPES } from "@/domain/listing-input";
import { brand } from "@/config/brand";
import { saveApplication, type ActionState } from "./actions";

type Values = Record<string, string | string[] | null | undefined>;

function FieldError({ state, name }: { state: ActionState; name: string }) {
  const msg = state.errors?.[name];
  return msg ? (
    <p id={`${name}-err`} className="field-error" role="alert">
      {msg}
    </p>
  ) : null;
}

const val = (state: ActionState, initial: Values, k: string) => {
  const v = state.values?.[k] ?? initial[k];
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
};
const list = (state: ActionState, initial: Values, k: string): string[] => {
  const v = state.values ? state.values[k] : initial[k];
  return Array.isArray(v) ? v : v ? [v] : [];
};

function Actions({ pending, submitLabel, draftLabel = "Save draft", canSubmit = true }: { pending: boolean; submitLabel: string; draftLabel?: string; canSubmit?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {canSubmit ? (
        <button className="btn lg" type="submit" name="intent" value="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
      ) : null}
      <button className="btn2 ink" type="submit" name="intent" value="draft" disabled={pending}>
        {draftLabel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ApplicationForm({ initial, counties, live }: { initial: Values; counties: { code: string; label: string }[]; live: boolean }) {
  const [state, action, pending] = useActionState(saveApplication, {});
  const langs = list(state, initial, "languages");
  const cats = list(state, initial, "categories");
  return (
    <form action={action} className="flex flex-col gap-7">
      <section className="flex flex-col gap-5" aria-labelledby="who-h">
        <h2 id="who-h" className="t2">
          Who you are
        </h2>
        <div className="field">
          <label className="label" htmlFor="display_name">
            Name learners will see
          </label>
          <input id="display_name" name="display_name" className="input" defaultValue={val(state, initial, "display_name")} maxLength={80} required />
          <FieldError state={state} name="display_name" />
        </div>
        <div className="field">
          <label className="label" htmlFor="headline">
            What you have done, in one line
          </label>
          <input
            id="headline"
            name="headline"
            className="input"
            defaultValue={val(state, initial, "headline")}
            maxLength={140}
            placeholder="Ran corporate communications at a Nairobi bank for nine years."
            required
          />
          <p className="help">What, where and for how long. This line sits under your name on every card.</p>
          <FieldError state={state} name="headline" />
        </div>
        <div className="field">
          <label className="label" htmlFor="bio">
            About you
          </label>
          <textarea id="bio" name="bio" className="input min-h-[160px]!" defaultValue={val(state, initial, "bio")} maxLength={4000} required />
          <p className="help">Your work, the people you have taught, and how you teach. No phone numbers or links: contact stays inside the platform.</p>
          <FieldError state={state} name="bio" />
        </div>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="what-h">
        <h2 id="what-h" className="t2">
          What you teach
        </h2>
        <fieldset className="flex flex-col gap-2.5">
          <legend className="label mb-2">Categories</legend>
          {CATEGORIES.map((c) => (
            <label key={c.code} className="check">
              <input type="checkbox" name="categories" value={c.code} defaultChecked={cats.includes(c.code)} />
              {c.label}
            </label>
          ))}
          <FieldError state={state} name="categories" />
        </fieldset>
        <fieldset className="flex flex-col gap-2.5">
          <legend className="label mb-2">Languages you teach in</legend>
          <div className="flex flex-wrap gap-x-6">
            {LANGUAGES.map(([code, label]) => (
              <label key={code} className="check">
                <input type="checkbox" name="languages" value={code} defaultChecked={langs.includes(code)} />
                {label}
              </label>
            ))}
          </div>
          <FieldError state={state} name="languages" />
        </fieldset>
        <div className="field">
          <label className="label" htmlFor="county_code">
            County you live in
          </label>
          <span className="sel block">
            <select id="county_code" name="county_code" className="select" defaultValue={val(state, initial, "county_code")}>
              <option value="">Choose a county</option>
              {counties.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </span>
          <p className="help">Only the county shows publicly, and only for in-person lessons.</p>
          <FieldError state={state} name="county_code" />
        </div>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="work-h">
        <h2 id="work-h" className="t2">
          Your work
        </h2>
        <fieldset className="flex flex-col gap-2.5">
          <legend className="label mb-2">Which describes you best?</legend>
          {TEACHER_TYPES.map(([code, label]) => (
            <label key={code} className="check">
              <input type="radio" name="teacher_type" value={code} defaultChecked={val(state, initial, "teacher_type") === code} />
              {label}
            </label>
          ))}
          <FieldError state={state} name="teacher_type" />
        </fieldset>
        <div className="field">
          <label className="label" htmlFor="employment_status">
            Current employment
          </label>
          <span className="sel block">
            <select id="employment_status" name="employment_status" className="select" defaultValue={val(state, initial, "employment_status")} required>
              <option value="">Choose one</option>
              {EMPLOYMENT.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </span>
          <p className="help">The TSC Code of Conduct bars teachers in full-time TSC employment from other paid work.</p>
          <FieldError state={state} name="employment_status" />
        </div>
        <label className="check items-start!">
          <input type="checkbox" name="declaration" className="mt-0.5" defaultChecked={val(state, initial, "declaration") === "on"} />
          <span>I confirm my employment is as stated, and I will tell {brand.name} if it changes.</span>
        </label>
        <FieldError state={state} name="declaration" />
      </section>

      {live ? (
        <div className="panel info" role="note">
          <p>
            <b>Your profile is live.</b> Saving changes sends it back for review, and your learning experiences leave Explore until it is approved
            again, usually within two working days.
          </p>
        </div>
      ) : null}
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <Actions pending={pending} submitLabel="Send for review" />
    </form>
  );
}
