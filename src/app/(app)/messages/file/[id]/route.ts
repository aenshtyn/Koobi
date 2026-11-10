import { NextResponse } from "next/server";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { signMessageFile } from "@/lib/message-files";

/** Opens a file sent in a message. Row-level security decides whether the caller may read that message. */
export async function GET(_: Request, ctx: RouteContext<"/messages/file/[id]">) {
  const { id } = await ctx.params;
  if (!hasSupabase || !/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const db = await serverClient();
  const { data } = await db.from("messages").select("attachment_key").eq("id", id).maybeSingle();
  const key = (data as { attachment_key: string | null } | null)?.attachment_key;
  if (!key) return new NextResponse("Not found", { status: 404 });
  const url = await signMessageFile(key);
  if (!url) return new NextResponse("The file could not be opened.", { status: 503 });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
