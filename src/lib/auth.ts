import "server-only";
import { redirect } from "next/navigation";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";

export type Role = "guardian" | "learner" | "teacher" | "concierge" | "reviewer" | "finance" | "admin";
export const STAFF_ROLES: Role[] = ["concierge", "reviewer", "finance", "admin"];

export type SessionUser = {
  id: string;
  phone: string | null;
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
    name: (profile?.display_name as string | null) ?? null,
    roles,
    dev: false,
  };
}

/** Signed-in guard for a page. `next` is where to return after sign-in. */
export async function requireUser(next: string, opts: { anyOf?: Role[] } = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(next)}`);
  if (opts.anyOf && !opts.anyOf.some((r) => user.roles.includes(r))) redirect("/forbidden");
  return user;
}
