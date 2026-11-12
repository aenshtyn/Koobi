"use client";
import { useActionState } from "react";
import { PASSWORD_MIN } from "@/domain/account";
import { finishEnrol, inviteStaff, staffSignIn, startEnrol, type EnrolState, type StaffLoginState } from "./actions";

export function StaffLoginForm() {
  const [state, action, pending] = useActionState<StaffLoginState, FormData>(staffSignIn, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="field">
        <label className="label" htmlFor="email">
          Work email
        </label>
        <input id="email" name="email" type="email" autoComplete="username" className="input" defaultValue={state.fields?.email ?? ""} required />
      </div>
      <div className="field">
        <label className="label" htmlFor="password">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" className="input" required />
      </div>
      <div className="field">
        <label className="label" htmlFor="code">
          Code from your authenticator app
        </label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="input mono tracking-[0.3em]" aria-describedby="code-help" />
        <p id="code-help" className="help">
          First time here? Leave this empty; we will help you set the app up.
        </p>
      </div>
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="btn block lg" type="submit" disabled={pending}>
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}

/** First-time setup: show the QR code, then check one code from the app. */
export function EnrolForm({ needsPassword }: { needsPassword: boolean }) {
  const [enrol, start, starting] = useActionState<EnrolState>(startEnrol, {});
  const [state, finish, pending] = useActionState<StaffLoginState, FormData>(finishEnrol, {});
  if (!enrol.factorId) {
    return (
      <form action={start} className="flex flex-col gap-4">
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-[16px]">
          <li>Install an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or Authy.</li>
          <li>Press the button below. A square code appears.</li>
          <li>Scan it with the app, then type the six digits the app shows.</li>
        </ol>
        {enrol.error ? (
          <p className="field-error" role="alert">
            {enrol.error}
          </p>
        ) : null}
        <button className="btn block lg" type="submit" disabled={starting}>
          {starting ? "Preparing…" : "Show my code"}
        </button>
      </form>
    );
  }
  return (
    <form action={finish} className="flex flex-col gap-5">
      <input type="hidden" name="factor_id" value={enrol.factorId} />
      <div className="card flex flex-col items-center gap-3">
        {/* A data: image made by Supabase for this one setup; next/image cannot optimise it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={enrol.qr} alt="QR code to scan with your authenticator app" width={196} height={196} className="bg-white p-2" />
        <p className="help text-center">
          Cannot scan? Type this key into the app instead:
          <br />
          <span className="mono break-all text-ink">{enrol.secret}</span>
        </p>
      </div>
      {needsPassword ? (
        <div className="field">
          <label className="label" htmlFor="password">
            Choose a password
          </label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} maxLength={72} className="input" required />
          <p className="help">At least {PASSWORD_MIN} characters.</p>
        </div>
      ) : null}
      <div className="field">
        <label className="label" htmlFor="code">
          Six digits from the app
        </label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="input mono tracking-[0.3em]" required />
      </div>
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="btn block lg" type="submit" disabled={pending}>
        {pending ? "Checking…" : "Finish setup"}
      </button>
    </form>
  );
}

const ROLES = [
  ["concierge", "Concierge", "Reads requests and sends shortlists."],
  ["reviewer", "Reviewer", "Checks applications, documents and listings."],
  ["finance", "Finance", "Payouts, refunds and reconciliation."],
  ["admin", "Admin", "Everything, including inviting staff."],
];

export function InviteForm() {
  const [state, action, pending] = useActionState<StaffLoginState, FormData>(inviteStaff, {});
  const f = state.fields ?? {};
  return (
    <form action={action} className="flex flex-col gap-5">
      {state.ok ? (
        <p className="panel escrow" role="status">
          {state.ok}
        </p>
      ) : null}
      <div className="field">
        <label className="label" htmlFor="name">
          Their name
        </label>
        <input id="name" name="name" className="input" defaultValue={f.name ?? ""} maxLength={80} required />
      </div>
      <div className="field">
        <label className="label" htmlFor="email">
          Their work email
        </label>
        <input id="email" name="email" type="email" className="input" defaultValue={f.email ?? ""} required />
      </div>
      <fieldset key={f.role ?? "none"} className="flex flex-col gap-2">
        <legend className="label mb-2">Role</legend>
        {ROLES.map(([value, label, note]) => (
          <label key={value} className="option">
            <input type="radio" name="role" value={value} defaultChecked={f.role === value} required />
            <span className="flex flex-col">
              <span className="font-semibold">{label}</span>
              <span className="help">{note}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="btn block lg" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send invitation"}
      </button>
    </form>
  );
}
