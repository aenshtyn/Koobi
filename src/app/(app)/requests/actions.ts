"use server";
import { redirect } from "next/navigation";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";

export type ShortlistState = { error?: string };

export async function acceptMatch(_: ShortlistState, form: FormData): Promise<ShortlistState> {
  if (!hasSupabase) return { error: "Not connected to the database." };
  const db = await serverClient();
  const { data, error } = await db.rpc("accept_match", { p_match: String(form.get("match_id") ?? "") });
  if (error) return { error: error.message };
  redirect(`/messages/${data}?new=1`);
}

export async function declineShortlist(_: ShortlistState, form: FormData): Promise<ShortlistState> {
  if (!hasSupabase) return { error: "Not connected to the database." };
  const id = String(form.get("request_id") ?? "");
  const db = await serverClient();
  const { error } = await db.rpc("decline_shortlist", { p_request: id, p_reason: String(form.get("reason") ?? "") });
  if (error) return { error: error.message };
  redirect(`/requests/${id}?declined=1`);
}
