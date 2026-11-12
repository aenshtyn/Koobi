import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SESSION_HOURS, sessionAgeHours, sessionStartedAt } from "@/domain/account";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Tells the sign-in page why the person was signed out. Read once, then it lapses. */
const EXPIRED_COOKIE = "koobi_signed_out";
/** Remembers a session's limit for ten minutes so most requests need no database call. Signed. */
const LIMIT_COOKIE = "koobi_session_limit";
const LIMIT_TTL_SECONDS = 600;
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.KOOBI_FIELD_KEY ?? "";

const sign = (value: string) => createHmac("sha256", secret).update(value).digest("base64url");

function readLimit(raw: string | undefined, userId: string, startedAt: number): number | null {
  if (!secret || !raw) return null;
  const [hours, until, mac] = raw.split(".");
  const body = `${userId}.${startedAt}.${hours}.${until}`;
  const expected = sign(body);
  if (!mac || mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  if (Number(until) < Date.now() / 1000) return null;
  const n = Number(hours);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Refreshes the Supabase session cookie on every request so Server Components see a valid
 * session, and ends sessions that have run longer than the person's roles allow: 12 hours for
 * staff, 7 days for experts, 30 days for learners and parents (Supabase has one project-wide
 * setting, so it is enforced here). Authorisation itself happens in the pages (lib/auth.ts) and
 * in RLS, never only here.
 */
export async function proxy(request: NextRequest) {
  if (!url || !key) return NextResponse.next();
  let response = NextResponse.next({ request });
  const extra: { name: string; value: string; maxAge: number }[] = [];
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    const { data: s } = await supabase.auth.getSession();
    const started = sessionStartedAt(s.session?.access_token) ?? (data.user.last_sign_in_at ? new Date(data.user.last_sign_in_at) : null);
    const age = started ? sessionAgeHours(started, new Date()) : 0;
    // Nobody's session is shorter than the staff limit, so younger sessions need no lookup.
    if (started && age > SESSION_HOURS.staff) {
      const stamp = Math.floor(started.getTime() / 1000);
      let limit: number | null = age > SESSION_HOURS.learner ? SESSION_HOURS.learner : readLimit(request.cookies.get(LIMIT_COOKIE)?.value, data.user.id, stamp);
      if (limit === null) {
        // Fails open if the database function is not there yet; the 30-day ceiling above still holds.
        const { data: hours, error } = await supabase.rpc("session_limit_hours");
        if (!error && typeof hours === "number") {
          limit = hours;
          if (secret) {
            const until = Math.floor(Date.now() / 1000) + LIMIT_TTL_SECONDS;
            extra.push({ name: LIMIT_COOKIE, value: `${hours}.${until}.${sign(`${data.user.id}.${stamp}.${hours}.${until}`)}`, maxAge: LIMIT_TTL_SECONDS });
          }
        }
      }
      if (limit !== null && age > limit) {
        // Set first, so the response that signOut rebuilds (through setAll) already carries it.
        request.cookies.set(EXPIRED_COOKIE, String(limit));
        await supabase.auth.signOut({ scope: "local" });
        extra.length = 0;
        extra.push({ name: EXPIRED_COOKIE, value: String(limit), maxAge: 300 }, { name: LIMIT_COOKIE, value: "", maxAge: 0 });
      }
    }
  }
  const secure = process.env.NODE_ENV === "production";
  extra.forEach((c) => response.cookies.set(c.name, c.value, { httpOnly: true, sameSite: "lax", secure, maxAge: c.maxAge, path: "/" }));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
