import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNext } from "@/domain/account";
import { afterSignIn, appOrigin } from "@/lib/account";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";

const TYPES: EmailOtpType[] = ["signup", "email", "recovery", "invite", "email_change", "magiclink"];

/**
 * Where every link in an account email lands: confirm your email, reset your password, a staff
 * invitation, a changed email address.
 *
 * Two shapes are accepted. The email templates set in the Supabase dashboard send
 * `?token_hash=…&type=…&next=…`, which works on any device. Supabase's default templates send
 * `?code=…`, which works only in the browser that asked for the email.
 *
 * `next` may be a path, or (from the templates' {{ .RedirectTo }}) this handler's own full address
 * with a path inside it; anything else is ignored.
 */
function readNext(request: NextRequest): string {
  const raw = request.nextUrl.searchParams.get("next") ?? "";
  if (raw.startsWith("/")) return safeNext(raw);
  try {
    const u = new URL(raw);
    if (u.pathname === "/auth/confirm") return safeNext(u.searchParams.get("next"));
  } catch {
    // not a URL
  }
  return "/home";
}

export async function GET(request: NextRequest) {
  // The address the person actually used (the Host header), not the server's own idea of its name.
  const origin = await appOrigin();
  const to = (path: string) => NextResponse.redirect(new URL(path, origin));
  if (!hasSupabase) return to("/signin");
  const q = request.nextUrl.searchParams;
  const next = readNext(request);
  const tokenHash = q.get("token_hash");
  const type = q.get("type") as EmailOtpType | null;
  const code = q.get("code");
  const db = await serverClient();

  let kind: EmailOtpType | "code" | null = null;
  if (tokenHash && type && TYPES.includes(type)) {
    const { error } = await db.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) kind = type;
  } else if (code) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) kind = "code";
  }
  if (!kind) return to("/link-expired");

  if (kind === "recovery" || next.startsWith("/reset-password")) return to(next.startsWith("/reset-password") ? next : "/reset-password");
  if (kind === "invite" || next.startsWith("/staff/login/setup")) return to("/staff/login/setup");
  if (kind === "email_change") return to("/account/settings?done=email");
  return to(await afterSignIn(db, next));
}
