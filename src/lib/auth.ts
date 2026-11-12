import "server-only";
import { redirect } from "next/navigation";
import { hasSupabase, testLogins } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";

export type Role = "guardian" | "learner" | "teacher" | "concierge" | "reviewer" | "finance" | "admin";
export const STAFF_ROLES: Role[] = ["concierge", "reviewer", "finance", "admin"];

export type SessionUser = {
  id: string;
  phone: string | null;
  email?: string | null;
  name: string | null;
  roles: Role[];
  /** true only in local development without Supabase, so shells can be reviewed */
  dev: boolean;
};

const DEV_USER: SessionUser = {
  id: "dev",
  phone: null,
  name: null,
  roles: ["learner", "guardian", "teacher", "concierge", "reviewer", "finance", "admin"],
  dev: true,
};

/** Reads the session cookie. Call inside a <Suspense> boundary. */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!hasSupabase) return process.env.NODE_ENV === "development" ? DEV_USER : null;
  const db = await serverClient();
  const { data } = await db.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await db.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  let roles: Role[] = Array.isArray(profile?.roles) ? (profile.roles as Role[]) : [];
  if (!roles.length) {
    const { data: rows } = await db.from("user_roles").select("role").eq("user_id", data.user.id);
    roles = (rows ?? []).map((r: { role: Role }) => r.role);
  }
  return {
    id: data.user.id,
    phone: (profile?.phone_e164 as string | null) ?? data.user.phone ?? null,
    email: data.user.email ?? (profile?.email as string | null) ?? null,
    name: (profile?.display_name as string | null) ?? null,
    roles,
    dev: false,
  };
}

/**
 * Signed-in guard for a page. `next` is where to return after sign-in.
 * Staff-only pages also need the authenticator step (AAL2), except with test logins on.
 */
export async function requireUser(next: string, opts: { anyOf?: Role[] } = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  const staffOnly = !!opts.anyOf?.length && opts.anyOf.every((r) => STAFF_ROLES.includes(r));
  if (!user) redirect(staffOnly ? "/staff/login" : `/signin?next=${encodeURIComponent(next)}`);
  if (opts.anyOf && !opts.anyOf.some((r) => user.roles.includes(r))) redirect("/forbidden");
  if (staffOnly && !user.dev && !testLogins) {
    const db = await serverClient();
    const { data } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.currentLevel !== "aal2") redirect("/staff/login");
  }
  return user;
}
