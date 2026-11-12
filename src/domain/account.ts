/**
 * Account rules (decided 2026-11-11): email and password is the only public sign-in; the phone is a
 * contact detail. Pure functions, shared by the forms, the server actions and the proxy.
 */

/** The terms a person ticks at sign-up. Change it when the terms page changes; old acceptances stay. */
export const TERMS_VERSION = "terms-2026-11-draft";
/** The consent line under the public "Request a match" form. */
export const REQUEST_CONSENT_VERSION = "request-contact-2026-11";

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72; // bcrypt reads no further

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (/^(.)\1+$/.test(password)) return "Choose a password that is harder to guess.";
  return null;
}

export function cleanEmail(raw: unknown): string | null {
  const v = String(raw ?? "").trim().toLowerCase();
  return v.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : null;
}

/** Only paths inside the app; anything else becomes the fallback. */
export function safeNext(v: unknown, fallback = "/home"): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") && !/[\r\n]/.test(s) ? s : fallback;
}

export type Intent = "self" | "child" | "teach";
export const isIntent = (v: unknown): v is Intent => v === "self" || v === "child" || v === "teach";
export const roleForIntent = (i: Intent) => (i === "teach" ? "teacher" : i === "child" ? "guardian" : "learner");

/** Where a new person lands when they did not come from a particular page. */
export function landingFor(intent: Intent, next: string | null): string {
  if (next && next !== "/home") return next;
  return intent === "teach" ? "/teach/apply" : intent === "child" ? "/account/learners/new" : "/home";
}

// ---------------------------------------------------------------------------
// Session length by role. Supabase has one project-wide setting, so the app enforces these.

const STAFF = ["concierge", "reviewer", "finance", "admin"];
export const SESSION_HOURS = { staff: 12, expert: 24 * 7, learner: 24 * 30 } as const;

/** The strictest role wins. */
export function sessionLimitHours(roles: readonly string[]): number {
  if (roles.some((r) => STAFF.includes(r))) return SESSION_HOURS.staff;
  if (roles.includes("teacher")) return SESSION_HOURS.expert;
  return SESSION_HOURS.learner;
}

/**
 * When this session began: the earliest sign-in step recorded in the access token (`amr`), which
 * stays the same when the token is refreshed. Null when the token cannot be read.
 */
export function sessionStartedAt(accessToken: string | undefined | null): Date | null {
  const part = accessToken?.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))) as {
      amr?: { method?: string; timestamp?: number }[];
      session_id?: string;
    };
    const stamps = (json.amr ?? []).map((a) => a.timestamp).filter((t): t is number => typeof t === "number" && t > 0);
    return stamps.length ? new Date(Math.min(...stamps) * 1000) : null;
  } catch {
    return null;
  }
}

export function sessionAgeHours(startedAt: Date, now: Date): number {
  return (now.getTime() - startedAt.getTime()) / 3_600_000;
}

export function lockoutMessage(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many tries. Wait ${minutes} ${minutes === 1 ? "minute" : "minutes"} and try again, or reset your password.`;
}

/** One message for every failed sign-in, so nobody can test which emails have accounts. */
export const SIGN_IN_FAILED = "That email and password do not match. Check both and try again.";
