"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SIGN_IN_FAILED,
  TERMS_VERSION,
  cleanEmail,
  isIntent,
  landingFor,
  lockoutMessage,
  passwordProblem,
  roleForIntent,
  safeNext,
} from "@/domain/account";
import { PENDING_EMAIL_COOKIE, PREFILL_COOKIE, afterSignIn, confirmUrl, cookieOpts } from "@/lib/account";
import { hasSupabase, testLogins } from "@/lib/supabase/config";
import TEST_ACCOUNTS from "@/config/test-accounts.json";
import { serverClient } from "@/lib/supabase/server";

/** `fields` echoes what was typed, because React clears a form after its action. Never a password. */
export type FormState = { error?: string; ok?: boolean; fields?: Record<string, string> };

const NOT_CONNECTED = "Sign-in is not connected in this environment. Add the Supabase keys to .env.local.";
const TRY_LATER = "That did not work just now. Wait a minute and try again.";

// ---------------------------------------------------------------------------
// Create account

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const fields = {
    name: String(form.get("name") ?? "").trim().slice(0, 80),
    email: String(form.get("email") ?? "").trim(),
    intent: String(form.get("intent") ?? ""),
  };
  const password = String(form.get("password") ?? "");
  const email = cleanEmail(fields.email);
  if (fields.name.length < 2) return { error: "Tell us your name.", fields };
  if (!email) return { error: "Enter your email address, like amina@example.com.", fields };
  const weak = passwordProblem(password);
  if (weak) return { error: `Password: ${weak}`, fields };
  if (!isIntent(fields.intent)) return { error: "Choose what brings you here.", fields };
  if (form.get("terms") !== "on") return { error: "Tick the box to accept the terms and the privacy notice.", fields };
  if (!hasSupabase) return { error: NOT_CONNECTED, fields };

  const next = landingFor(fields.intent, safeNext(form.get("next"), "") || null);
  const db = await serverClient();
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: {
      // The database trigger turns `intent` into a role and records the terms version.
      data: { display_name: fields.name, intent: fields.intent, terms_version: TERMS_VERSION },
      emailRedirectTo: await confirmUrl(next),
    },
  });
  if (error) {
    if (error.status === 429) return { error: "Too many sign-ups from here just now. Wait a few minutes and try again.", fields };
    if (error.code === "weak_password") return { error: "Choose a password that is harder to guess.", fields };
    // Anything else, including "already registered", gets the same next screen: no hint about who has an account.
    if (error.code !== "user_already_exists" && error.code !== "email_exists") {
      // The code is for whoever runs the server (for example: email sending is not set up). No address is logged.
      if (error.code === "email_address_invalid") return { error: "That email address cannot receive mail. Check it and try again.", fields };
      console.error(`[auth] sign-up refused: ${error.code ?? "unknown"} (${error.status ?? "?"})`);
      return { error: TRY_LATER, fields };
    }
  }
  const jar = await cookies();
  jar.delete(PREFILL_COOKIE);
  // Email confirmation switched off in the project (local set-ups): the person is already signed in.
  if (data?.session) redirect(await afterSignIn(db, next));
  jar.set(PENDING_EMAIL_COOKIE, JSON.stringify({ email, next }), cookieOpts(3600));
  redirect("/signup/check-email");
}

async function pending(): Promise<{ email: string; next: string } | null> {
  try {
    const v = JSON.parse((await cookies()).get(PENDING_EMAIL_COOKIE)?.value ?? "null") as { email?: string; next?: string } | null;
    const email = cleanEmail(v?.email);
    return email ? { email, next: safeNext(v?.next) } : null;
  } catch {
    return null;
  }
}

export async function resendConfirmation(): Promise<FormState> {
  if (!hasSupabase) return { error: NOT_CONNECTED };
  const p = await pending();
  if (!p) redirect("/signup");
  const db = await serverClient();
  const { error } = await db.auth.resend({ type: "signup", email: p.email, options: { emailRedirectTo: await confirmUrl(p.next) } });
  return error ? { error: "We could not send another email yet. Wait a minute and try again." } : { ok: true };
}

// ---------------------------------------------------------------------------
// Sign in

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const fields = { email: String(form.get("email") ?? "").trim() };
  const email = cleanEmail(fields.email);
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));
  if (!email || !password) return { error: "Enter your email and password.", fields };
  if (!hasSupabase) return { error: NOT_CONNECTED, fields };

  const db = await serverClient();
  // The lock is by address, whether or not it has an account, so it gives nothing away.
  const { data: wait } = await db.rpc("sign_in_wait", { p_email: email });
  if (typeof wait === "number" && wait > 0) return { error: lockoutMessage(wait), fields };

  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    // Supabase checks the password first, so this only shows to someone who knows it.
    if (error.code === "email_not_confirmed") {
      (await cookies()).set(PENDING_EMAIL_COOKIE, JSON.stringify({ email, next }), cookieOpts(3600));
      redirect("/signup/check-email");
    }
    if (error.status === 429) return { error: "Too many tries from here. Wait a few minutes and try again.", fields };
    const { data: locked } = await db.rpc("note_sign_in_failure", { p_email: email });
    return { error: typeof locked === "number" && locked > 0 ? lockoutMessage(locked) : SIGN_IN_FAILED, fields };
  }
  redirect(await afterSignIn(db, next));
}

// ---------------------------------------------------------------------------
// Forgot password, and choosing a new one

export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const fields = { email: String(form.get("email") ?? "").trim() };
  const email = cleanEmail(fields.email);
  if (!email) return { error: "Enter your email address.", fields };
  if (!hasSupabase) return { error: NOT_CONNECTED, fields };
  const after = safeNext(form.get("next"));
  const db = await serverClient();
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: await confirmUrl(`/reset-password?next=${encodeURIComponent(after)}`),
  });
  if (error?.status === 429) return { error: "You asked a moment ago. Check your inbox, or wait a minute and try again.", fields };
  // The same answer whether or not the address has an account.
  return { ok: true, fields };
}

export async function setNewPassword(_: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  const weak = passwordProblem(password);
  if (weak) return { error: weak };
  if (password !== String(form.get("confirm") ?? "")) return { error: "The two passwords are not the same." };
  if (!hasSupabase) return { error: NOT_CONNECTED };
  const db = await serverClient();
  const { data } = await db.auth.getUser();
  if (!data.user) redirect("/forgot-password");

  // An account with an authenticator (staff) must prove it before the password can change.
  const { data: factors } = await db.auth.mfa.listFactors();
  const totp = factors?.totp?.find((f) => f.status === "verified");
  if (totp) {
    const code = String(form.get("code") ?? "").replace(/\D/g, "");
    if (code.length !== 6) return { error: "Enter the six-digit code from your authenticator app." };
    const { error: mfaError } = await db.auth.mfa.challengeAndVerify({ factorId: totp.id, code });
    if (mfaError) return { error: "That code did not work. Codes change every 30 seconds." };
  }
  const { error } = await db.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "Choose a password you have not used here before." };
    if (error.code === "weak_password") return { error: "Choose a password that is harder to guess." };
    return { error: TRY_LATER };
  }
  // Every other device is signed out; this one stays in.
  await db.auth.signOut({ scope: "others" });
  await db.rpc("clear_sign_in_failures");
  redirect(await afterSignIn(db, safeNext(form.get("next"), totp ? "/staff" : "/home")));
}

// ---------------------------------------------------------------------------
// Welcome: only for accounts that have no name or no role yet

export async function saveWelcome(_: FormState, form: FormData): Promise<FormState> {
  const fields = { name: String(form.get("name") ?? "").trim().slice(0, 80), intent: String(form.get("intent") ?? "") };
  if (fields.name.length < 2) return { error: "Tell us your name.", fields };
  if (!isIntent(fields.intent)) return { error: "Choose one option.", fields };
  if (form.get("terms") !== "on") return { error: "Tick the box to accept the terms and the privacy notice.", fields };
  if (!hasSupabase) return { error: NOT_CONNECTED, fields };

  const db = await serverClient();
  const { data } = await db.auth.getUser();
  if (!data.user) redirect("/signin");
  const { error } = await db.from("profiles").update({ display_name: fields.name }).eq("id", data.user.id);
  if (error) return { error: "We could not save that. Try again.", fields };
  // Role grants go through a security-definer function so users cannot grant staff roles.
  await db.rpc("claim_role", { p_role: roleForIntent(fields.intent) });
  await db.rpc("accept_terms", { p_version: TERMS_VERSION });
  redirect(landingFor(fields.intent, safeNext(form.get("next"), "") || null));
}

// ---------------------------------------------------------------------------
// Test accounts and signing out

/** Password sign-in for the per-role test accounts (scripts/test-users.mjs). Dev and staging only. */
export async function testSignIn(_: FormState, form: FormData): Promise<FormState> {
  if (!testLogins || !hasSupabase) return { error: "Test accounts are switched off in this environment." };
  const account = TEST_ACCOUNTS.find((a) => a.key === form.get("account"));
  const password = String(form.get("password") ?? "");
  const fields = { account: String(form.get("account") ?? "") };
  if (!account) return { error: "Choose an account.", fields };
  if (!password) return { error: "Enter the test password.", fields };
  const db = await serverClient();
  await db.auth.signOut({ scope: "local" });
  const { error } = await db.auth.signInWithPassword({ email: account.email, password });
  if (error) {
    return {
      error: error.message.toLowerCase().includes("invalid")
        ? "That did not work. Check the password, and that npm run test-users has been run for this project."
        : `Sign-in failed: ${error.message}`,
      fields,
    };
  }
  redirect(account.home);
}

export async function signOut() {
  if (hasSupabase) {
    const db = await serverClient();
    await db.auth.signOut({ scope: "local" });
  }
  redirect("/");
}
