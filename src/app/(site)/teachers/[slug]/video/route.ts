import { NextResponse } from "next/server";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";
import { signView } from "@/lib/expert-uploads";

/**
 * The introduction video of a published profile. Videos sit in a private bucket; this hands the
 * player a link that lasts an hour, and only for a video Koobi approved on a profile that is public.
 */
export async function GET(_: Request, ctx: RouteContext<"/teachers/[slug]/video">) {
  const { slug } = await ctx.params;
  if (!hasAdmin || !/^[a-z0-9-]{1,80}$/.test(slug)) return new NextResponse("Not found", { status: 404 });
  const { data: key, error } = await adminClient().rpc("public_video_key", { p_slug: slug });
  if (error || typeof key !== "string") return new NextResponse("Not found", { status: 404 });
  const url = await signView("video", key, 3600);
  if (!url) return new NextResponse("Not available", { status: 503 });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=1800" } });
}
