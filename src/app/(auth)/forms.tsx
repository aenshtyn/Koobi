"use client";
import { useActionState, useState } from "react";
import { BookOpen, GraduationCap, UserRound } from "lucide-react";
import { resendCode, saveWelcome, sendCode, testSignIn, verifyCode, type FormState } from "./actions";

function ErrorLine({ state, id }: { state: FormState; id: string }) {
  return state.error ? (
    <p id={id} className="field-error" role="alert">
      {state.error}
    </p>
  ) : null;
}

export function PhoneForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(sendCode, {});
  const [intl, setIntl] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label className="label" htmlFor="phone">
          Phone number
        </label>
        <div className="inputwrap">
          {intl ? null : <span className="pre">+254</span>}
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="mono"
            placeholder={intl ? "+44 7700 900123" : "712 345 678"}
            aria-describedby="phone-help phone-err"
            required
          />
        </div>
        <p id="phone-help" className="help">
          We send a six-digit code by SMS. We never show your number on your profile.
        </p>
        <ErrorLine state={state} id="phone-err" />
      </div>
      <label className="check">
        <input type="checkbox" name="intl" checked={intl} onChange={(e) => setIntl(e.target.checked)} />
        My number is outside Kenya
      </label>
      <button className="btn block lg" type="submit" disabled={pending}>
        {pending ? "Sending the code…" : "Send code"}
      </button>
    </form>
  );
}

export function CodeForm() {
  const [state, action, pending] = useActionState(verifyCode, {});
  const [resent, resend, resending] = useActionState(resendCode, {});
  return (
    <div className="flex flex-col gap-5">
      <form action={action} className="flex flex-col gap-5">
        <div className="field">
          <label className="label" htmlFor="code">
            Six-digit code
          </label>
          <div className="inputwrap">
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={7}
              className="mono text-center text-[26px]! tracking-[0.4em]!"
              aria-describedby="code-err"
              required
              autoFocus
            />
          </div>
          <ErrorLine state={state} id="code-err" />
        </div>
        <button className="btn block lg" type="submit" disabled={pending}>
          {pending ? "Checking…" : "Continue"}
        </button>
      </form>
      <form action={resend} className="flex flex-wrap items-center gap-2 text-[15px]">
        <span className="text-ink-2">No SMS after a minute?</span>
        <button className="btn3" type="submit" disabled={resending}>
          Send a new code
        </button>
        {resent.ok ? <span className="text-forest">Sent.</span> : null}
        {resent.error ? <span className="field-error">{resent.error}</span> : null}
      </form>
    </div>
  );
}

const INTENTS = [
  { value: "self", label: "I want to learn", Icon: UserRound },
  { value: "child", label: "I am arranging lessons for my child", Icon: GraduationCap },
  { value: "teach", label: "I want to teach", Icon: BookOpen },
];

export function WelcomeForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(saveWelcome, {});
  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label className="label" htmlFor="name">
          Your name
        </label>
        <input id="name" name="name" className="input" autoComplete="name" required />
        <p className="help">Teachers and experts see your first name only.</p>
      </div>
      <fieldset className="flex flex-col gap-2.5">
        <legend className="label mb-2">What brings you here?</legend>
        {INTENTS.map(({ value, label, Icon }) => (
          <label key={value} className="reply">
            <input type="radio" name="intent" value={value} required />
            <Icon size={22} aria-hidden="true" />
            {label}
          </label>
        ))}
      </fieldset>
      <ErrorLine state={state} id="welcome-err" />
      <button className="btn block lg" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}

type TestAccount = { key: string; email: string; label: string; note: string };

export function TestSignInForm({ accounts }: { accounts: TestAccount[] }) {
  const [state, action, pending] = useActionState(testSignIn, {});
  return (
    <form action={action} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2.5">
        <legend className="label mb-2">Sign in as</legend>
        {accounts.map((a, i) => (
          <label key={a.key} className="reply">
            <input type="radio" name="account" value={a.key} defaultChecked={i === 0} required />
            <span className="flex min-w-0 flex-col">
              <span>{a.label}</span>
              <span className="mono text-[13px] font-normal opacity-75">{a.email}</span>
              <span className="text-[14px] font-normal opacity-80">{a.note}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label className="label" htmlFor="test-password">
          Test password
        </label>
        <input id="test-password" name="password" type="password" autoComplete="current-password" className="input" required />
        <p className="help">The shared password in KOOBI_TEST_PASSWORD. Ask the person who ran npm run test-users.</p>
      </div>
      <ErrorLine state={state} id="test-err" />
      <button className="btn block lg" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
