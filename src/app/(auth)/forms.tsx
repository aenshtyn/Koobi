"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { BookOpen, Eye, EyeOff, GraduationCap, UserRound } from "lucide-react";
import { PASSWORD_MIN } from "@/domain/account";
import {
  requestPasswordReset,
  resendConfirmation,
  saveWelcome,
  setNewPassword,
  signIn,
  signUp,
  testSignIn,
  type FormState,
} from "./actions";

function ErrorLine({ state, id }: { state: FormState; id: string }) {
  return state.error ? (
    <p id={id} className="field-error" role="alert">
      {state.error}
    </p>
  ) : null;
}

/** A password box with a show and hide button. Never pre-filled by the server. */
export function PasswordField({ id, name = id, label, autoComplete, help }: { id: string; name?: string; label: string; autoComplete: "new-password" | "current-password"; help?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="inputwrap">
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={autoComplete === "new-password" ? PASSWORD_MIN : undefined}
          maxLength={72}
          aria-describedby={help ? `${id}-help` : undefined}
          required
        />
        <button
          type="button"
          className="mr-1.5 inline-flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-2 hover:bg-sand"
          aria-label={show ? "Hide the password" : "Show the password"}
          aria-pressed={show}
          onClick={() => setShow((s) => !s)}
        >
          {show ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
        </button>
      </div>
      {help ? (
        <p id={`${id}-help`} className="help">
          {help}
        </p>
      ) : null}
    </div>
  );
}

const INTENTS = [
  { value: "self", label: "I want to learn", Icon: UserRound },
  { value: "child", label: "I am arranging lessons for my child", Icon: GraduationCap },
  { value: "teach", label: "I want to teach", Icon: BookOpen },
];

function IntentField({ value }: { value?: string }) {
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="label mb-2">What brings you here?</legend>
      {INTENTS.map(({ value: v, label, Icon }) => (
        <label key={v} className="reply">
          <input type="radio" name="intent" value={v} defaultChecked={value === v} required />
          <Icon size={22} aria-hidden="true" />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

function TermsTick() {
  return (
    <label className="check items-start!">
      <input type="checkbox" name="terms" required className="mt-0.5" />
      <span>
        I accept the{" "}
        <Link href="/terms" target="_blank">
          terms
        </Link>{" "}
        and the{" "}
        <Link href="/privacy" target="_blank">
          privacy notice
        </Link>
        .
      </span>
    </label>
  );
}

export function SignUpForm({ next, initial }: { next: string; initial: { name?: string; email?: string; intent?: string } }) {
  const [state, action, pending] = useActionState(signUp, { fields: initial as Record<string, string> });
  const f = state.fields ?? {};
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label className="label" htmlFor="name">
          Your name
        </label>
        <input id="name" name="name" className="input" autoComplete="name" defaultValue={f.name ?? ""} maxLength={80} required />
      </div>
      <div className="field">
        <label className="label" htmlFor="email">
          Email address
        </label>
        <input id="email" name="email" type="email" inputMode="email" className="input" autoComplete="email" defaultValue={f.email ?? ""} required />
        <p className="help">We send one email to confirm it is yours.</p>
      </div>
      <PasswordField id="password" label="Password" autoComplete="new-password" help={`At least ${PASSWORD_MIN} characters. A few words together work well.`} />
      <IntentField key={f.intent ?? "none"} value={f.intent} />
      <TermsTick />
      <ErrorLine state={state} id="signup-err" />
      <button className="btn block lg" type="submit" disabled={pending}>
        {pending ? "Creating your account…" : "Create account"}
      </button>
    </form>
  );
}

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label className="label" htmlFor="email">
          Email address
        </label>
        <input id="email" name="email" type="email" inputMode="email" className="input" autoComplete="username" defaultValue={state.fields?.email ?? ""} required />
      </div>
      <PasswordField id="password" label="Password" autoComplete="current-password" />
      <ErrorLine state={state} id="signin-err" />
      <button className="btn block lg" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export function ResendForm() {
  const [state, action, pending] = useActionState(resendConfirmation, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-[15px]">
      <span className="text-ink-2">Nothing after a few minutes?</span>
      <button className="btn3" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send the email again"}
      </button>
      {state.ok ? (
        <span className="text-forest" role="status">
          Sent.
        </span>
      ) : null}
      {state.error ? (
        <span className="field-error" role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

export function ForgotForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(requestPasswordReset, {});
  if (state.ok) {
    return (
      <div className="panel escrow" role="status">
        <p>
          <b>Check your email.</b> If <span className="mono break-all">{state.fields?.email}</span> has an account, a link to choose a new
          password is on its way. It works once, for one hour.
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label className="label" htmlFor="email">
          Email address
        </label>
        <input id="email" name="email" type="email" inputMode="email" className="input" autoComplete="username" defaultValue={state.fields?.email ?? ""} required />
      </div>
      <ErrorLine state={state} id="forgot-err" />
      <button className="btn block lg" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Email me a link"}
      </button>
    </form>
  );
}

export function NewPasswordForm({ next, needsCode }: { next: string; needsCode: boolean }) {
  const [state, action, pending] = useActionState(setNewPassword, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <PasswordField id="password" label="New password" autoComplete="new-password" help={`At least ${PASSWORD_MIN} characters.`} />
      <PasswordField id="confirm" label="The same password again" autoComplete="new-password" />
      {needsCode ? (
        <div className="field">
          <label className="label" htmlFor="code">
            Code from your authenticator app
          </label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="input mono tracking-[0.3em]" required />
        </div>
      ) : null}
      <ErrorLine state={state} id="newpw-err" />
      <button className="btn block lg" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save the new password"}
      </button>
    </form>
  );
}

export function WelcomeForm({ next, name }: { next: string; name: string }) {
  const [state, action, pending] = useActionState(saveWelcome, { fields: { name } });
  const f = state.fields ?? {};
  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label className="label" htmlFor="name">
          Your name
        </label>
        <input id="name" name="name" className="input" autoComplete="name" defaultValue={f.name ?? ""} maxLength={80} required />
        <p className="help">Teachers and experts see your first name only.</p>
      </div>
      <IntentField key={f.intent ?? "none"} value={f.intent} />
      <TermsTick />
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
  const chosen = state.fields?.account ?? accounts[0]?.key;
  return (
    <form action={action} className="flex flex-col gap-6">
      <fieldset key={chosen} className="flex flex-col gap-2.5">
        <legend className="label mb-2">Sign in as</legend>
        {accounts.map((a) => (
          <label key={a.key} className="reply">
            <input type="radio" name="account" value={a.key} defaultChecked={a.key === chosen} required />
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
