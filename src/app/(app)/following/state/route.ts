import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";

/**
 * Who the signed-in person follows, as slugs, for the Follow buttons on public pages (Explore, an
 * expert's profile). Those pages are cached for everyone, so each visitor's own state is read here.
 */
export async function GET() {
  const json = (body: object) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" } });
  if (!hasSupabase) return json({ signedIn: false, ready: false, slugs: [] });
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return json({ signedIn: false, ready: true, slugs: [] });
  const { data, error } = await db.rpc("my_following");
  if (error) return json({ signedIn: true, ready: false, slugs: [] });
  return json({ signedIn: true, ready: true, slugs: ((data ?? []) as { slug: string }[]).map((r) => r.slug) });
}
