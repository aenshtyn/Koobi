"use server";
import { redirect } from "next/navigation";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";

export type StaffLoginState = { error?: string };

/** Staff sign in with email, password and a TOTP code (PRD FR-ACC staff, AAL2). */
export async function staffSignIn(_: StaffLoginState, form: FormData): Promise<StaffLoginState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  if (!email || !password || code.length !== 6) return { error: "Enter your email, password and the six-digit code from your app." };
  if (!hasSupabase) return { error: "Staff sign-in is not connected in this environment." };

  const db = await serverClient();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return { error: "Those details did not match. Five failed tries lock the account for 15 minutes." };
  const { data: factors } = await db.auth.mfa.listFactors();
  const totp = factors?.totp?.find((f) => f.status === "verified");
  if (!totp) {
    await db.auth.signOut();
    return { error: "This account has no authenticator set up. Ask an admin to enrol one." };
  }
  const { error: mfaError } = await db.auth.mfa.challengeAndVerify({ factorId: totp.id, code });
  if (mfaError) {
    await db.auth.signOut();
    return { error: "That code did not work. Codes change every 30 seconds." };
  }
  redirect("/staff");
}
