"use server";
import { revalidatePath } from "next/cache";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { friendly } from "@/lib/db-error";

/** Follow or unfollow an expert. The database holds the follow, so every page shows the same state. */
export type FollowResult = { ok: boolean; error?: string };

const isSlug = (v: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v);

export async function followExpert(slug: string): Promise<FollowResult> {
  if (!hasSupabase || !isSlug(slug)) return { ok: false, error: "That did not work. Try again." };
  const db = await serverClient();
  const { error } = await db.rpc("follow_teacher", { p_slug: slug });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/following");
  return { ok: true };
}

/** Removes the follow only. Bookings, payments, packages and conversations are untouched. */
export async function unfollowExpert(slug: string): Promise<FollowResult> {
  if (!hasSupabase || !isSlug(slug)) return { ok: false, error: "That did not work. Try again." };
  const db = await serverClient();
  const { error } = await db.rpc("unfollow_teacher", { p_slug: slug });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/following");
  return { ok: true };
}
