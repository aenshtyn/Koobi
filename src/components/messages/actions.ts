"use server";
import { redirect } from "next/navigation";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { MESSAGE_MAX } from "@/domain/matching";

export type SendState = { error?: string };

export async function sendMessage(_: SendState, form: FormData): Promise<SendState> {
  if (!hasSupabase) return { error: "Not connected to the database." };
  const thread = String(form.get("thread_id") ?? "");
  const base = form.get("base") === "/teach/messages" ? "/teach/messages" : "/messages";
  const body = String(form.get("body") ?? "").trim();
  if (!body) return { error: "Write a message first." };
  if (body.length > MESSAGE_MAX) return { error: `Keep it under ${MESSAGE_MAX.toLocaleString("en-KE")} characters.` };
  const db = await serverClient();
  const { error } = await db.from("messages").insert({ thread_id: thread, body });
  if (error) return { error: "We could not send that. Try again." };
  redirect(`${base}/${thread}#latest`);
}

/** Called once a thread is on screen; marks everything up to now as read. */
export async function markThreadRead(threadId: string) {
  if (!hasSupabase) return;
  const db = await serverClient();
  const { data } = await db.auth.getUser();
  if (!data.user) return;
  await db.from("thread_participants").update({ last_read_at: new Date().toISOString() }).eq("thread_id", threadId).eq("user_id", data.user.id);
}
