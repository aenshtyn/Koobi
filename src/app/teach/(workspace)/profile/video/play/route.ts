import { NextResponse, type NextRequest } from "next/server";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { signView } from "@/lib/expert-uploads";

/**
 * Plays one of the expert's own introduction videos (any status), or, for a reviewer, a video sent for
 * review. The database decides who may; the link to the private file lasts an hour.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!hasSupabase || !/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const db = await serverClient();
  const { data: key, error } = await db.rpc("video_key", { p_video: id });
  if (error || typeof key !== "string") return new NextResponse("Not found", { status: 404 });
  const url = await signView("video", key, 3600);
  if (!url) return new NextResponse("Not available", { status: 503 });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
}
