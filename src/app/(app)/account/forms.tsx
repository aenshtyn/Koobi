"use client";
import { useActionState } from "react";
import { useEchoAction } from "@/lib/use-echo-action";
import { addChild, saveProfile, savePrefs, submitIdCheck, uploadIdDocument, type AState } from "./actions";
import type { Prefs } from "@/lib/data/account";

function ErrorLine({ error }: { error?: string }) {
  return error ? (
    <p className="field-error" role="alert">
      {error}
    </p>
  ) : null;
}

export function ChildForm({ consentText, curricula, needName }: { consentText: string; curricula: [string, string][]; needName: boolean }) {
  const [state, action, pending] = useEchoAction<AState>(addChild, {});
  const year = new Date().getFullYear();
  return (
    <form action={action} className="flex flex-col gap-5">
      {needName ? (
        <div className="field">
          <label className="label" htmlFor="parent_name">
            Your name
          </label>
          <input id="parent_name" name="parent_name" className="input" maxLength={80} required defaultValue={state.values?.parent_name} />
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label className="label" htmlFor="alias">
            Child’s first name or nickname
          </label>
          <input id="alias" name="alias" className="input" maxLength={40} required defaultValue={state.values?.alias} />
          <p className="help">Never a full name. Teachers see only this.</p>
        </div>
        <div className="field">
          <label className="label" htmlFor="year_of_birth">
            Year of birth
          </label>
          <input id="year_of_birth" name="year_of_birth" className="input mono" inputMode="numeric" pattern="[0-9]{4}" min={year - 25} max={year - 3} required defaultValue={state.values?.year_of_birth} />
        </div>
        <div className="field">
          <label className="label" htmlFor="curriculum">
            Curriculum (optional)
          </label>
          <select id="curriculum" name="curriculum" className="input" defaultValue={state.values?.curriculum ?? ""}>
            <option value="">Not sure</option>
            {curricula.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="language">
            Language of instruction
          </label>
          <select id="language" name="language" className="input" defaultValue={state.values?.language ?? "en"}>
            <option value="en">English</option>
            <option value="sw">Kiswahili</option>
          </select>
        </div>
      </div>
      <div className="card flex flex-col gap-3 p-5">
        <p className="text-[15px] leading-6">{consentText}</p>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="consent" value="yes" className="mt-1 h-5 w-5" required />
          <span className="font-semibold">I am the parent or legal guardian and I give this consent.</span>
        </label>
      </div>
      <ErrorLine error={state.error} />
      <button className="btn self-start" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Add child"}
      </button>
    </form>
  );
}

export function IdUploadForm() {
  const [state, action, pending] = useActionState<AState, FormData>(uploadIdDocument, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label className="label" htmlFor="kind">
            What the photo is
          </label>
          <select id="kind" name="kind" className="input" defaultValue="id_front">
            <option value="id_front">ID, front</option>
            <option value="id_back">ID, back</option>
            <option value="passport">Passport</option>
            <option value="selfie">Photo of you holding the ID</option>
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="file">
            File
          </label>
          <input id="file" name="file" type="file" className="input" accept="image/jpeg,image/png,application/pdf" required />
        </div>
      </div>
      <ErrorLine error={state.error} />
      <button className="btn2 self-start" type="submit" disabled={pending}>
        {pending ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}

export function IdSubmitForm() {
  const [state, action, pending] = useActionState<AState, FormData>(submitIdCheck, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="field">
        <label className="label" htmlFor="id_number">
          ID or passport number
        </label>
        <input id="id_number" name="id_number" className="input mono max-w-64" autoComplete="off" required />
        <p className="help">Stored encrypted. Only the reviewer sees it.</p>
      </div>
      <ErrorLine error={state.error} />
      <button className="btn self-start" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send for review"}
      </button>
    </form>
  );
}

const pick = "chip cursor-pointer has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-white has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-orange/60";

function Picks({ name, legend, options, chosen }: { name: string; legend: string; options: [string, string][]; chosen: string[] }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="label mb-2">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([code, label]) => (
          <label key={code} className={pick}>
            <input type="checkbox" name={name} value={code} defaultChecked={chosen.includes(code)} className="sr-only" />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export type ProfileFormProps = {
  name: string;
  locale: string;
  country: string;
  countries: [string, string][];
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  /** Null until the database has learning preferences. */
  prefs: { categories: string[]; formats: string[]; languages: string[] } | null;
  categories: [string, string][];
  formats: [string, string][];
};

function Verified({ ok }: { ok: boolean }) {
  return <span className={`pill flex-none ${ok ? "bg-forest-tint text-forest-ink" : "bg-sand text-ink-2"}`}>{ok ? "Verified" : "Not verified"}</span>;
}

/** My Profile: personal details, the contact details used to sign in (read only), learning preferences. */
export function ProfileForm(p: ProfileFormProps) {
  const [state, action, pending] = useActionState<AState, FormData>(saveProfile, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card flex flex-col gap-4 p-5" aria-labelledby="pi-h">
          <h2 id="pi-h" className="t3">
            Personal information
          </h2>
          <div className="field">
            <label className="label" htmlFor="display_name">
              Your name
            </label>
            <input id="display_name" name="display_name" className="input" defaultValue={p.name} maxLength={80} required autoComplete="name" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field">
              <label className="label" htmlFor="country_code">
                Country of residence
              </label>
              <select id="country_code" name="country_code" className="input" defaultValue={p.country}>
                {p.countries.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="locale">
                Language for messages
              </label>
              <select id="locale" name="locale" className="input" defaultValue={p.locale}>
                <option value="en">English</option>
                <option value="sw">Kiswahili</option>
              </select>
            </div>
          </div>
        </section>
        <section className="card flex flex-col gap-4 p-5" aria-labelledby="ci-h">
          <h2 id="ci-h" className="t3">
            Contact information
          </h2>
          <div className="flex flex-col gap-1">
            <span className="label">Email address</span>
            <span className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">{p.email ?? "Not added"}</span>
              {p.email ? <Verified ok={p.emailVerified} /> : null}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="label">Phone number</span>
            <span className="flex items-center justify-between gap-3">
              {p.phone ? <span className="mono">{p.phone}</span> : <span>Not added</span>}
              {p.phone ? <Verified ok={p.phoneVerified} /> : null}
            </span>
          </div>
          <p className="help">These are the details you sign in with. An expert sees your phone number only after your first paid booking with them.</p>
        </section>
      </div>
      {p.prefs ? (
        <section className="card flex flex-col gap-5 p-5" aria-labelledby="lp-h">
          <input type="hidden" name="has_prefs" value="1" />
          <div className="flex flex-col gap-1">
            <h2 id="lp-h" className="t3">
              Learning preferences
            </h2>
            <p className="help">Choose any that fit. Your Home page suggests learning experiences from these.</p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <Picks name="categories" legend="Subjects and skills" options={p.categories} chosen={p.prefs.categories} />
            <Picks
              name="languages"
              legend="Preferred languages"
              options={[
                ["en", "English"],
                ["sw", "Kiswahili"],
              ]}
              chosen={p.prefs.languages}
            />
            <Picks name="formats" legend="Learning formats" options={p.formats} chosen={p.prefs.formats} />
          </div>
        </section>
      ) : null}
      <ErrorLine error={state.error} />
      <div className="flex flex-wrap items-center gap-3 border-t border-dashed border-line-2 pt-4">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button className="btn2 ink" type="reset">
          Cancel
        </button>
      </div>
    </form>
  );
}

function Box({ name, label, help, on, disabled }: { name: string; label: string; help?: string; on: boolean; disabled?: boolean }) {
  return (
    <label className="option">
      <input type="checkbox" name={name} defaultChecked={on} disabled={disabled} />
      <span className="flex flex-col">
        <span>{label}</span>
        {help ? <span className="help">{help}</span> : null}
      </span>
    </label>
  );
}

export function PrefsForm({ prefs, hasEmail, followReady = false }: { prefs: Prefs; hasEmail: boolean; followReady?: boolean }) {
  const [state, action, pending] = useActionState<AState, FormData>(savePrefs, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <Box name="sms_enabled" label="SMS" help="Bookings, reminders and receipts." on={prefs.sms_enabled} />
      <Box name="whatsapp_opt_in" label="WhatsApp instead of SMS" help="We fall back to SMS if WhatsApp fails." on={prefs.whatsapp_opt_in} />
      <Box name="email_enabled" label="Email receipts" help={hasEmail ? undefined : "Add an email when you sign in to use this."} on={prefs.email_enabled} disabled={!hasEmail} />
      <Box name="marketing_opt_in" label="News and offers from Koobi" on={prefs.marketing_opt_in} />
      {followReady ? (
        <>
          <input type="hidden" name="has_follow_updates" value="1" />
          <Box name="follow_updates" label="Updates from experts I follow" help="New learning experiences, new dates and new times, shown under the bell." on={prefs.follow_updates ?? true} />
        </>
      ) : null}
      <p className="help">Messages that are not urgent wait until 07:00 if they would arrive after 21:00.</p>
      <ErrorLine error={state.error} />
      <button className="btn2 self-start" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save choices"}
      </button>
    </form>
  );
}
