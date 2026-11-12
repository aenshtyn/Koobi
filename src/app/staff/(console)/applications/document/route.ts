import { NextResponse, type NextRequest } from "next/server";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { signView } from "@/lib/expert-uploads";

/**
 * Opens one identity document or credential for a reviewer. The database checks the role and writes
 * the view to the audit log before the file's key is handed over; the link lasts one minute.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!hasSupabase || !/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const db = await serverClient();
  const { data: key, error } = await db.rpc("credential_key", { p_credential: id });
  if (error || typeof key !== "string") return new NextResponse("You cannot open this document.", { status: 403 });
  const url = await signView("document", key, 60);
  if (!url) return new NextResponse("The file could not be opened.", { status: 503 });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
}
