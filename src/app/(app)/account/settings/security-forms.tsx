"use client";
import { useActionState } from "react";
import { PASSWORD_MIN } from "@/domain/account";
import { PasswordField } from "@/app/(auth)/forms";
import { changeEmail, changePassword, changePhone, signOutEverywhere, type SecState } from "./security-actions";

function Result({ state }: { state: SecState }) {
  return (
    <>
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="panel escrow" role="status">
          {state.ok}
        </p>
      ) : null}
    </>
  );
}

export function EmailForm({ current }: { current: string | null }) {
  const [state, action, pending] = useActionState<SecState, FormData>(changeEmail, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="help">
        You sign in with <span className="mono break-all text-ink">{current ?? "no email yet"}</span>
      </p>
      <div className="field">
        <label className="label" htmlFor="new-email">
          New email address
        </label>
        <input id="new-email" name="email" type="email" inputMode="email" autoComplete="email" className="input" defaultValue={state.fields?.email ?? ""} required />
      </div>
      <Result state={state} />
      <button className="btn2 self-start" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Change email"}
      </button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<SecState, FormData>(changePassword, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <PasswordField id="current" label="Current password" autoComplete="current-password" />
      <PasswordField id="new-password" name="password" label="New password" autoComplete="new-password" help={`At least ${PASSWORD_MIN} characters. Other devices are signed out when you save.`} />
      <Result state={state} />
      <button className="btn2 self-start" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}

export function PhoneForm({ current }: { current: string | null }) {
  const [state, action, pending] = useActionState<SecState, FormData>(changePhone, {});
  const code = state.step === "code";
  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="help">
        {current ? (
          <>
            Your number is <span className="mono text-ink">{current}</span>. It is never shown on a public page.
          </>
        ) : (
          "No phone number yet. It is used for SMS notices and, for experts, M-Pesa payouts. It is never shown on a public page."
        )}
      </p>
      <div className="field">
        <label className="label" htmlFor="phone">
          {current ? "New phone number" : "Phone number"}
        </label>
        <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" className="input mono" placeholder="0712 345 678" defaultValue={state.fields?.phone ?? ""} readOnly={code} required />
      </div>
      {code ? (
        <div className="field">
          <input type="hidden" name="step" value="code" />
          <label className="label" htmlFor="phone-code">
            Six-digit code from the SMS
          </label>
          <input id="phone-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="input mono tracking-[0.3em]" required autoFocus />
          <p className="help">We sent it to the number above. It works for 10 minutes.</p>
        </div>
      ) : null}
      <Result state={state} />
      <button className="btn2 self-start" type="submit" disabled={pending}>
        {pending ? "Checking…" : code ? "Confirm the number" : "Send me a code"}
      </button>
    </form>
  );
}

export function SignOutEverywhere() {
  return (
    <form action={signOutEverywhere} className="flex flex-col gap-3">
      <p className="help">Signs you out on this device and every other phone or computer. Use it if you lost a device or used a shared one.</p>
      <button className="btn2 ink self-start" type="submit">
        Sign out everywhere
      </button>
    </form>
  );
}
