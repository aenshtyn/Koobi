"use client";
import { useActionState, useState } from "react";
import { CATEGORIES } from "@/domain/taxonomy";
import {
  CATEGORY_TRACKS,
  CURRICULA,
  DURATIONS,
  EMPLOYMENT,
  LANGUAGES,
  MEETING_TOOLS,
  OFFER_MODES,
  PRICE_BANDS,
  TEACHER_TYPES,
  WEEKDAYS,
  sessionPrice,
} from "@/domain/listing-input";
import { formatKES } from "@/domain/format";
import { brand } from "@/config/brand";
import { addWindow, saveApplication, saveOffer, type ActionState } from "./actions";

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
            <b>Your profile is live.</b> Saving changes sends it back for review, and your offers leave Explore until it is approved
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

// ---------------------------------------------------------------------------

export function OfferForm({ initial, live }: { initial: Values; live: boolean }) {
  const [state, action, pending] = useActionState(saveOffer, {});
  const [category, setCategory] = useState(val(state, initial, "category") || "career_professional_growth");
  const [kind, setKind] = useState(val(state, initial, "kind") || "adults_professional");
  const [price, setPrice] = useState(val(state, initial, "price_hour_kes"));
  const [duration, setDuration] = useState(val(state, initial, "duration_minutes") || "60");
  const modes = list(state, initial, "modes");
  const [online, setOnline] = useState(modes.length ? modes.includes("online") : true);
  const tracks = CATEGORY_TRACKS[category as keyof typeof CATEGORY_TRACKS] ?? ["adults_professional"];
  const track = tracks.length === 1 ? tracks[0] : tracks.includes(kind as never) ? kind : tracks[0];
  const band = PRICE_BANDS[track as keyof typeof PRICE_BANDS];
  const hourly = Number(String(price).replace(/[,\s]/g, ""));
  const perSession = hourly > 0 ? sessionPrice(hourly, Number(duration)) : null;
  const langs = list(state, initial, "language_codes");

  return (
    <form action={action} className="flex flex-col gap-7">
      <input type="hidden" name="id" value={String(initial.id ?? "")} />
      <section className="flex flex-col gap-5" aria-labelledby="basics-h">
        <h2 id="basics-h" className="t2">
          The basics
        </h2>
        <div className="field">
          <label className="label" htmlFor="title">
            Title
          </label>
          <input id="title" name="title" className="input" defaultValue={val(state, initial, "title")} maxLength={120} placeholder="Business English for professionals" required />
          <FieldError state={state} name="title" />
        </div>
        <fieldset className="flex flex-col gap-2.5">
          <legend className="label mb-2">Category</legend>
          {CATEGORIES.map((c) => (
            <label key={c.code} className="check">
              <input type="radio" name="category" value={c.code} checked={category === c.code} onChange={() => setCategory(c.code)} />
              {c.label}
            </label>
          ))}
          <FieldError state={state} name="category" />
        </fieldset>
        {tracks.length > 1 ? (
          <fieldset className="flex flex-col gap-2.5">
            <legend className="label mb-2">What kind of skill is it?</legend>
            <label className="check">
              <input type="radio" name="kind" value="adults_professional" checked={track === "adults_professional"} onChange={() => setKind("adults_professional")} />
              Professional or digital (a desk, a laptop, an office)
            </label>
            <label className="check">
              <input type="radio" name="kind" value="practical" checked={track === "practical"} onChange={() => setKind("practical")} />
              Hands-on (farming, trades, crafts)
            </label>
          </fieldset>
        ) : null}
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="field">
            <label className="label" htmlFor="subject_text">
              Subject or skill
            </label>
            <input id="subject_text" name="subject_text" className="input" defaultValue={val(state, initial, "subject_text")} maxLength={120} placeholder="Business English" required />
            <FieldError state={state} name="subject_text" />
          </div>
          {track === "school" ? (
            <div className="field">
              <label className="label" htmlFor="curriculum_code">
                Curriculum
              </label>
              <span className="sel block">
                <select id="curriculum_code" name="curriculum_code" className="select" defaultValue={val(state, initial, "curriculum_code")}>
                  <option value="">Any</option>
                  {CURRICULA.map(([c, l]) => (
                    <option key={c} value={c}>
                      {l}
                    </option>
                  ))}
                </select>
              </span>
            </div>
          ) : null}
        </div>
        <div className="field">
          <label className="label" htmlFor="summary">
            One line for the card
          </label>
          <input id="summary" name="summary" className="input" defaultValue={val(state, initial, "summary")} maxLength={300} placeholder="Write emails and reports that get read, and speak up in meetings." required />
          <FieldError state={state} name="summary" />
        </div>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="detail-h">
        <h2 id="detail-h" className="t2">
          The detail
        </h2>
        <div className="field">
          <label className="label" htmlFor="description">
            About this offer
          </label>
          <textarea id="description" name="description" className="input min-h-[140px]!" defaultValue={val(state, initial, "description")} maxLength={5000} />
          <FieldError state={state} name="description" />
        </div>
        <div className="field">
          <label className="label" htmlFor="outcomes">
            What learners will work on
          </label>
          <textarea id="outcomes" name="outcomes" className="input" defaultValue={val(state, initial, "outcomes")} placeholder={"Emails and reports that get read\nLeading and minuting meetings"} />
          <p className="help">One point per line, up to 10.</p>
          <FieldError state={state} name="outcomes" />
        </div>
        <div className="field">
          <label className="label" htmlFor="goal">
            Who it is for <span className="font-normal text-ink-2">(optional)</span>
          </label>
          <input id="goal" name="goal" className="input" defaultValue={val(state, initial, "goal")} maxLength={300} placeholder="Professionals who write and present in English at work" />
        </div>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="how-h">
        <h2 id="how-h" className="t2">
          How it runs
        </h2>
        <fieldset className="flex flex-col gap-2.5">
          <legend className="label mb-2">Where lessons happen</legend>
          {OFFER_MODES.map(([code, label]) => (
            <label key={code} className="check">
              <input
                type="checkbox"
                name="modes"
                value={code}
                defaultChecked={modes.length ? modes.includes(code) : code === "online"}
                onChange={code === "online" ? (e) => setOnline(e.target.checked) : undefined}
              />
              {label}
            </label>
          ))}
          <FieldError state={state} name="modes" />
        </fieldset>
        <div className="grid gap-5 sm:grid-cols-2">
          {online ? (
            <div className="field">
              <label className="label" htmlFor="meeting_tool">
                Online lessons on
              </label>
              <span className="sel block">
                <select id="meeting_tool" name="meeting_tool" className="select" defaultValue={val(state, initial, "meeting_tool") || "google_meet"}>
                  {Object.entries(MEETING_TOOLS).map(([c, l]) => (
                    <option key={c} value={c}>
                      {l}
                    </option>
                  ))}
                </select>
              </span>
              <FieldError state={state} name="meeting_tool" />
            </div>
          ) : null}
          <div className="field">
            <label className="label" htmlFor="duration_minutes">
              Session length
            </label>
            <span className="sel block">
              <select id="duration_minutes" name="duration_minutes" className="select" value={duration} onChange={(e) => setDuration(e.target.value)}>
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} minutes
                  </option>
                ))}
              </select>
            </span>
            <FieldError state={state} name="duration_minutes" />
          </div>
        </div>
        <fieldset className="flex flex-col gap-2.5">
          <legend className="label mb-2">Languages</legend>
          <div className="flex flex-wrap gap-x-6">
            {LANGUAGES.map(([code, label]) => (
              <label key={code} className="check">
                <input type="checkbox" name="language_codes" value={code} defaultChecked={langs.length ? langs.includes(code) : code === "en"} />
                {label}
              </label>
            ))}
          </div>
          <FieldError state={state} name="language_codes" />
        </fieldset>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="price-h">
        <h2 id="price-h" className="t2">
          Price
        </h2>
        <div className="field max-w-[360px]">
          <label className="label" htmlFor="price_hour_kes">
            Price per hour
          </label>
          <div className="inputwrap">
            <span className="pre">KES</span>
            <input
              id="price_hour_kes"
              name="price_hour_kes"
              inputMode="numeric"
              className="mono"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              aria-describedby="price-help"
              required
            />
          </div>
          <p id="price-help" className="help">
            Between <span className="mono">{formatKES(band.min)}</span> and <span className="mono">{formatKES(band.max)}</span> for this kind of offer.
            {perSession ? (
              <>
                {" "}
                Learners see <span className="mono font-semibold text-ink">{formatKES(perSession)}</span> per {duration}-minute session.
              </>
            ) : null}
          </p>
          <FieldError state={state} name="price_hour_kes" />
        </div>
        <label className="check">
          <input type="checkbox" name="trial" defaultChecked={state.values ? state.values.trial === "on" : initial.trial === "on"} />
          Offer a first trial lesson at half price (you are still paid the full price)
        </label>
      </section>

      {live ? (
        <div className="panel info" role="note">
          <p>
            <b>This offer is live.</b> Saving changes sends it back for review and takes it off Explore until it is approved again.
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

// ---------------------------------------------------------------------------

export function WindowForm({ offeringId }: { offeringId: string }) {
  const [state, action, pending] = useActionState(addWindow, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="offering_id" value={offeringId} />
      <div className="field">
        <label className="label" htmlFor={`wd-${offeringId}`}>
          Day
        </label>
        <span className="sel block">
          <select id={`wd-${offeringId}`} name="weekday" className="select" defaultValue="1">
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </span>
      </div>
      <div className="field">
        <label className="label" htmlFor={`st-${offeringId}`}>
          From
        </label>
        <input id={`st-${offeringId}`} name="starts" type="time" step={900} defaultValue="17:00" className="input mono w-[140px]!" required />
      </div>
      <div className="field">
        <label className="label" htmlFor={`en-${offeringId}`}>
          To
        </label>
        <input id={`en-${offeringId}`} name="ends" type="time" step={900} defaultValue="20:00" className="input mono w-[140px]!" required />
      </div>
      <button className="btn2" type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add time"}
      </button>
      {state.error || state.errors?.starts || state.errors?.weekday ? (
        <p className="field-error w-full" role="alert">
          {state.error ?? state.errors?.starts ?? state.errors?.weekday}
        </p>
      ) : null}
    </form>
  );
}
