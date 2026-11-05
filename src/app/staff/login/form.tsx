"use client";
import { useActionState } from "react";
import { staffSignIn, type StaffLoginState } from "./actions";

export function StaffLoginForm() {
  const [state, action, pending] = useActionState<StaffLoginState, FormData>(staffSignIn, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="field">
        <label className="label" htmlFor="email">
          Work email
        </label>
        <input id="email" name="email" type="email" autoComplete="username" className="input" required />
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
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="input mono tracking-[0.3em]" required />
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
