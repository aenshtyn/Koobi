"use server";
import { redirect } from "next/navigation";
import { cleanEmail, lockoutMessage, passwordProblem } from "@/domain/account";
import { normaliseKenyanPhone } from "@/domain/format";
import { confirmUrl } from "@/lib/account";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";

/** Sign-in details on Settings: email, password, phone, and signing out everywhere. */
export type SecState = { error?: string; ok?: string; fields?: Record<string, string>; step?: "code" };

const OFF = "Not connected to the database.";

async function me() {
  const db = await serverClient();
  const { data } = await db.auth.getUser();
  if (!data.user) redirect("/signin?next=%2Faccount%2Fsettings");
  return { db, user: data.user };
}

export async function changeEmail(_: SecState, form: FormData): Promise<SecState> {
  const fields = { email: String(form.get("email") ?? "").trim() };
  const email = cleanEmail(fields.email);
  if (!email) return { error: "Enter the new email address.", fields };
  if (!hasSupabase) return { error: OFF, fields };
  const { db, user } = await me();
  if (email === user.email?.toLowerCase()) return { error: "That is already your email address.", fields };
  const { error } = await db.auth.updateUser({ email }, { emailRedirectTo: await confirmUrl("/account/settings?done=email") });
  if (error) {
    if (error.status === 429) return { error: "You asked a moment ago. Check your inbox, or wait a minute.", fields };
    // "Already used by someone" gets the same answer as success: nothing is revealed about other accounts.
    if (error.code !== "email_exists") return { error: "We could not start the change. Try again in a minute.", fields };
  }
  return { ok: `Open the link we sent to ${email} to finish. Until then you sign in with your current address.` };
}

export async function changePassword(_: SecState, form: FormData): Promise<SecState> {
  const current = String(form.get("current") ?? "");
  const password = String(form.get("password") ?? "");
  if (!current) return { error: "Enter your current password." };
  const weak = passwordProblem(password);
  if (weak) return { error: `New password: ${weak}` };
  if (password === current) return { error: "Choose a password different from the current one." };
  if (!hasSupabase) return { error: OFF };
  const { db, user } = await me();
  if (!user.email) return { error: "Add an email address to your account first." };

  // The current password is checked by signing in with it; wrong tries count toward the lock.
  const { data: wait } = await db.rpc("sign_in_wait", { p_email: user.email });
  if (typeof wait === "number" && wait > 0) return { error: lockoutMessage(wait) };
  const { error: wrong } = await db.auth.signInWithPassword({ email: user.email, password: current });
  if (wrong) {
    await db.rpc("note_sign_in_failure", { p_email: user.email });
    return { error: "The current password is not right. Check it and try again." };
  }
  const { error } = await db.auth.updateUser({ password });
  if (error) {
    if (error.code === "weak_password") return { error: "Choose a password that is harder to guess." };
    if (error.code === "insufficient_aal") return { error: "Staff change their password from the staff sign-in page: use “Forgot your password?” there." };
    return { error: "We could not save the new password. Try again in a minute." };
  }
  await db.auth.signOut({ scope: "others" });
  return { ok: "Password changed. Every other device was signed out." };
}

function cleanPhone(raw: string): string | null {
  const v = raw.replace(/[\s()-]/g, "");
  return /^\+[1-9]\d{6,14}$/.test(v) ? v : normaliseKenyanPhone(raw);
}

/** Step 1: send a code by SMS to the new number. Step 2: check it. The number is saved only after that. */
export async function changePhone(_: SecState, form: FormData): Promise<SecState> {
  const fields = { phone: String(form.get("phone") ?? "").trim() };
  if (!hasSupabase) return { error: OFF, fields };
  const phone = cleanPhone(fields.phone);
  if (!phone) return { error: "Enter a mobile number, like 0712 345 678, or with its country code, like +44 7700 900123.", fields };
  const { db } = await me();
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  if (form.get("step") === "code") {
    if (code.length !== 6) return { error: "Enter the six-digit code from the SMS.", fields, step: "code" };
    const { error } = await db.auth.verifyOtp({ phone, token: code, type: "phone_change" });
    if (error) return { error: "That code did not work. Check it, or ask for a new one.", fields, step: "code" };
    redirect("/account/settings?done=phone");
  }
  const { error } = await db.auth.updateUser({ phone });
  if (error) {
    if (error.status === 429) return { error: "Too many codes requested. Wait a few minutes and try again.", fields };
    if (error.code === "phone_exists") return { error: "That number is already on another account.", fields };
    return { error: "We could not send a code to that number just now. Check the number, or try again later.", fields };
  }
  return { fields, step: "code" };
}

export async function signOutEverywhere() {
  if (hasSupabase) {
    const db = await serverClient();
    await db.auth.signOut({ scope: "global" });
  }
  redirect("/signin");
}
