"use server";
import { redirect } from "next/navigation";
import { SIGN_IN_FAILED, cleanEmail, lockoutMessage, passwordProblem } from "@/domain/account";
import { appOrigin } from "@/lib/account";
import { STAFF_ROLES, requireUser, type Role } from "@/lib/auth";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";

export type StaffLoginState = { error?: string; ok?: string; fields?: Record<string, string> };
export type EnrolState = { error?: string; factorId?: string; qr?: string; secret?: string };

/** Staff sign in with email, password and a TOTP code (PRD FR-ACC staff, AAL2). */
export async function staffSignIn(_: StaffLoginState, form: FormData): Promise<StaffLoginState> {
  const fields = { email: String(form.get("email") ?? "").trim() };
  const email = cleanEmail(fields.email);
  const password = String(form.get("password") ?? "");
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  if (!email || !password) return { error: "Enter your work email and password.", fields };
  if (!hasSupabase) return { error: "Staff sign-in is not connected in this environment.", fields };

  const db = await serverClient();
  const { data: wait } = await db.rpc("sign_in_wait", { p_email: email });
  if (typeof wait === "number" && wait > 0) return { error: lockoutMessage(wait), fields };
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    const { data: locked } = await db.rpc("note_sign_in_failure", { p_email: email });
    return { error: typeof locked === "number" && locked > 0 ? lockoutMessage(locked) : `${SIGN_IN_FAILED} Five failed tries lock the account for 15 minutes.`, fields };
  }
  const { data: factors } = await db.auth.mfa.listFactors();
  const totp = factors?.totp?.find((f) => f.status === "verified");
  // First time: the password is right but no authenticator is set up yet. Only staff may set one up here.
  if (!totp) redirect("/staff/login/setup");
  if (code.length !== 6) {
    await db.auth.signOut({ scope: "local" });
    return { error: "Enter the six-digit code from your authenticator app.", fields };
  }
  const { error: mfaError } = await db.auth.mfa.challengeAndVerify({ factorId: totp.id, code });
  if (mfaError) {
    await db.auth.signOut({ scope: "local" });
    await db.rpc("note_sign_in_failure", { p_email: email });
    return { error: "That code did not work. Codes change every 30 seconds.", fields };
  }
  await db.rpc("clear_sign_in_failures");
  redirect("/staff");
}

/** Step 1 of first-time setup: make a new authenticator secret and show it as a QR code. */
export async function startEnrol(): Promise<EnrolState> {
  if (!hasSupabase) return { error: "Staff sign-in is not connected in this environment." };
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/staff/login");
  const { data: roles } = await db.from("user_roles").select("role").eq("user_id", auth.user.id);
  if (!(roles ?? []).some((r: { role: Role }) => STAFF_ROLES.includes(r.role))) redirect("/forbidden");
  const { data: factors } = await db.auth.mfa.listFactors();
  if (factors?.totp?.some((f) => f.status === "verified")) redirect("/staff/login");
  // Half-finished attempts are removed so a fresh code can be made.
  for (const f of factors?.all ?? []) if (f.status !== "verified") await db.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await db.auth.mfa.enroll({ factorType: "totp", friendlyName: `Koobi staff ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) return { error: "We could not start the setup. Try again in a minute." };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Step 2: an invited person chooses a password, then proves the authenticator works. */
export async function finishEnrol(_: StaffLoginState, form: FormData): Promise<StaffLoginState> {
  if (!hasSupabase) return { error: "Staff sign-in is not connected in this environment." };
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/staff/login");
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  const factorId = String(form.get("factor_id") ?? "");
  if (code.length !== 6 || !factorId) return { error: "Enter the six-digit code your app shows." };
  if (auth.user.user_metadata?.needs_password) {
    const password = String(form.get("password") ?? "");
    const weak = passwordProblem(password);
    if (weak) return { error: `Password: ${weak}` };
    const { error } = await db.auth.updateUser({ password, data: { needs_password: false } });
    if (error) return { error: error.code === "weak_password" ? "Choose a password that is harder to guess." : "We could not save the password. Try again." };
  }
  const { error } = await db.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: "That code did not work. Codes change every 30 seconds; enter the one showing now." };
  redirect("/staff");
}

const INVITABLE: Role[] = ["concierge", "reviewer", "finance", "admin"];

/** An admin invites a colleague by email. They get a link, choose a password and set up an authenticator. */
export async function inviteStaff(_: StaffLoginState, form: FormData): Promise<StaffLoginState> {
  await requireUser("/staff/login/invite", { anyOf: ["admin"] });
  const fields = { name: String(form.get("name") ?? "").trim().slice(0, 80), email: String(form.get("email") ?? "").trim(), role: String(form.get("role") ?? "") };
  const email = cleanEmail(fields.email);
  if (fields.name.length < 2) return { error: "Enter their name.", fields };
  if (!email) return { error: "Enter their work email address.", fields };
  if (!INVITABLE.includes(fields.role as Role)) return { error: "Choose a role.", fields };
  if (!hasAdmin) return { error: "Invitations need SUPABASE_SECRET_KEY on the server.", fields };

  const { data, error } = await adminClient().auth.admin.inviteUserByEmail(email, {
    data: { display_name: fields.name, needs_password: true },
    redirectTo: `${await appOrigin()}/auth/confirm?next=${encodeURIComponent("/staff/login/setup")}`,
  });
  if (error || !data.user) {
    return {
      error: error?.code === "email_exists" || error?.status === 422
        ? "That email already has an account. Grant the role on the Users page instead."
        : "The invitation could not be sent. Check the address and try again.",
      fields,
    };
  }
  // The role goes through the same audited function as the Users page.
  const db = await serverClient();
  const { error: roleError } = await db.rpc("set_staff_role", { p_user: data.user.id, p_role: fields.role, p_grant: true });
  if (roleError) return { error: `The invitation was sent, but the role was not granted: ${roleError.message}. Grant it on the Users page.`, fields };
  return { ok: `Invitation sent to ${email}. The link works once, for 24 hours.` };
}
