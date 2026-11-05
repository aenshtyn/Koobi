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

export function ProfileForm({ name, locale }: { name: string; locale: string }) {
  const [state, action, pending] = useActionState<AState, FormData>(saveProfile, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="field">
        <label className="label" htmlFor="display_name">
          Your name
        </label>
        <input id="display_name" name="display_name" className="input" defaultValue={name} maxLength={80} required />
      </div>
      <div className="field">
        <label className="label" htmlFor="locale">
          Language for messages
        </label>
        <select id="locale" name="locale" className="input max-w-64" defaultValue={locale}>
          <option value="en">English</option>
          <option value="sw">Kiswahili</option>
        </select>
      </div>
      <ErrorLine error={state.error} />
      <button className="btn2 self-start" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
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

export function PrefsForm({ prefs, hasEmail }: { prefs: Prefs; hasEmail: boolean }) {
  const [state, action, pending] = useActionState<AState, FormData>(savePrefs, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <Box name="sms_enabled" label="SMS" help="Bookings, reminders and receipts." on={prefs.sms_enabled} />
      <Box name="whatsapp_opt_in" label="WhatsApp instead of SMS" help="We fall back to SMS if WhatsApp fails." on={prefs.whatsapp_opt_in} />
      <Box name="email_enabled" label="Email receipts" help={hasEmail ? undefined : "Add an email when you sign in to use this."} on={prefs.email_enabled} disabled={!hasEmail} />
      <Box name="marketing_opt_in" label="News and offers from Koobi" on={prefs.marketing_opt_in} />
      <p className="help">Messages that are not urgent wait until 07:00 if they would arrive after 21:00.</p>
      <ErrorLine error={state.error} />
      <button className="btn2 self-start" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save choices"}
      </button>
    </form>
  );
}
