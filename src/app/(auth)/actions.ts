"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { normaliseKenyanPhone } from "@/domain/format";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";

export type FormState = { error?: string; ok?: boolean };

const PHONE_COOKIE = "koobi_otp_phone";
const NEXT_COOKIE = "koobi_next";

function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/home";
}

const NOT_CONNECTED = "Sign-in is not connected in this environment. Add the Supabase keys to .env.local.";

export async function sendCode(_: FormState, form: FormData): Promise<FormState> {
  const raw = String(form.get("phone") ?? "");
  const intl = form.get("intl") === "on";
  const phone = intl ? (/^\+\d{8,15}$/.test(raw.replace(/\s/g, "")) ? raw.replace(/\s/g, "") : null) : normaliseKenyanPhone(raw);
  if (!phone) {
    return { error: intl ? "Enter the number with its country code, like +44 7700 900123." : "Enter a Kenyan mobile number, like 0712 345 678." };
  }
  if (!hasSupabase) return { error: NOT_CONNECTED };

  const db = await serverClient();
  const { error } = await db.auth.signInWithOtp({ phone });
  if (error) {
    return { error: error.status === 429 ? "Too many codes requested. Wait a few minutes and try again." : "We could not send the code. Check the number and try again." };
  }
  const jar = await cookies();
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" };
  jar.set(PHONE_COOKIE, phone, opts);
  jar.set(NEXT_COOKIE, safeNext(form.get("next")), opts);
  redirect("/signin/code");
}

export async function verifyCode(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("code") ?? "").replace(/\D/g, "");
  if (token.length !== 6) return { error: "Enter the six-digit code from the SMS." };
  if (!hasSupabase) return { error: NOT_CONNECTED };

  const jar = await cookies();
  const phone = jar.get(PHONE_COOKIE)?.value;
  if (!phone) redirect("/signin");
  const db = await serverClient();
  const { data, error } = await db.auth.verifyOtp({ phone, token, type: "sms" });
  if (error || !data.user) return { error: "That code did not work. Check it, or ask for a new one." };

  const next = jar.get(NEXT_COOKIE)?.value ?? "/home";
  jar.delete(PHONE_COOKIE);
  jar.delete(NEXT_COOKIE);
  const { data: profile } = await db.from("profiles").select("display_name").eq("id", data.user.id).maybeSingle();
  redirect(profile?.display_name ? next : `/welcome?next=${encodeURIComponent(next)}`);
}

export async function resendCode(): Promise<FormState> {
  if (!hasSupabase) return { error: NOT_CONNECTED };
  const phone = (await cookies()).get(PHONE_COOKIE)?.value;
  if (!phone) redirect("/signin");
  const db = await serverClient();
  const { error } = await db.auth.signInWithOtp({ phone });
  return error ? { error: "We could not send a new code yet. Wait a minute and try again." } : { ok: true };
}

export async function saveWelcome(_: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get("name") ?? "").trim();
  const intent = String(form.get("intent") ?? "");
  if (name.length < 2) return { error: "Tell us your name." };
  if (!["self", "child", "teach"].includes(intent)) return { error: "Choose one option." };
  if (!hasSupabase) return { error: NOT_CONNECTED };

  const db = await serverClient();
  const { data } = await db.auth.getUser();
  if (!data.user) redirect("/signin");
  const role = intent === "teach" ? "teacher" : intent === "child" ? "guardian" : "learner";
  const { error } = await db.from("profiles").update({ display_name: name }).eq("id", data.user.id);
  if (error) return { error: "We could not save that. Try again." };
  // Role grants go through a security-definer function so users cannot grant staff roles.
  await db.rpc("claim_role", { p_role: role });
  if (intent === "teach") redirect("/teach/apply");
  if (intent === "child") redirect("/account/learners/new");
  redirect(safeNext(form.get("next")));
}

export async function signOut() {
  if (hasSupabase) {
    const db = await serverClient();
    await db.auth.signOut();
  }
  redirect("/");
}
