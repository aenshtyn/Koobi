import "server-only";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeNext } from "@/domain/account";

/** Short-lived, httpOnly: the address a confirmation was sent to, and details typed on the request form. */
export const PENDING_EMAIL_COOKIE = "koobi_pending_email";
export const PREFILL_COOKIE = "koobi_prefill";
export const SIGNED_OUT_COOKIE = "koobi_signed_out";

export const cookieOpts = (maxAge: number) => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge, path: "/" });

/** Where links in emails point. KOOBI_APP_URL wins; in development the request's own address is used. */
export async function appOrigin(): Promise<string> {
  const fixed = process.env.KOOBI_APP_URL?.replace(/\/$/, "");
  const h = await headers();
  // In development the address in the browser wins, so links work on whichever port the server runs.
  if (fixed && process.env.NODE_ENV !== "development") return fixed;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** The address an email link returns to; `next` is where the person goes after it is checked. */
export async function confirmUrl(next: string): Promise<string> {
  return `${await appOrigin()}/auth/confirm?next=${encodeURIComponent(safeNext(next))}`;
}

/**
 * Runs once a session exists (sign-in, or an email link): resets the failed-password count, links
 * requests sent as a guest with this email, and decides where to go. Accounts with no name or no
 * role still pass through /welcome.
 */
export async function afterSignIn(db: SupabaseClient, next: string): Promise<string> {
  const { data } = await db.auth.getUser();
  if (!data.user) return `/signin?next=${encodeURIComponent(next)}`;
  // Both functions arrive with migrations 20261108; before that they fail quietly.
  await Promise.all([db.rpc("clear_sign_in_failures"), db.rpc("claim_guest_requests")]);
  const [{ data: profile }, { data: roles }] = await Promise.all([
    db.from("profiles").select("display_name").eq("id", data.user.id).maybeSingle(),
    db.from("user_roles").select("role").eq("user_id", data.user.id),
  ]);
  if (!profile?.display_name || !(roles ?? []).length) return `/welcome?next=${encodeURIComponent(next)}`;
  return next;
}
