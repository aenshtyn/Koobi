"use server";
import { redirect } from "next/navigation";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { MESSAGE_MAX } from "@/domain/matching";
import { friendly } from "@/lib/db-error";
import { removeMessageFile, uploadMessageFile } from "@/lib/message-files";

export type SendState = { error?: string };

export async function sendMessage(_: SendState, form: FormData): Promise<SendState> {
  if (!hasSupabase) return { error: "Not connected to the database." };
  const thread = String(form.get("thread_id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(thread)) return { error: "We could not send that. Try again." };
  const base = form.get("base") === "/teach/messages" ? "/teach/messages" : "/messages";
  const text = String(form.get("body") ?? "").trim();
  const picked = form.get("file");
  const file = picked instanceof File && picked.size > 0 ? picked : null;
  if (!text && !file) return { error: "Write a message first." };
  if (text.length > MESSAGE_MAX) return { error: `Keep it under ${MESSAGE_MAX.toLocaleString("en-KE")} characters.` };
  const db = await serverClient();
  if (file) {
    // Only a participant may put a file in this conversation's folder.
    const { data: mine } = await db.rpc("my_threads");
    const t = ((mine ?? []) as { id: string; contact_revealed: boolean }[]).find((x) => x.id === thread);
    if (!t) return { error: "We could not send that. Try again." };
    if (!t.contact_revealed) return { error: "Files can be shared after the first paid booking between you." };
    const up = await uploadMessageFile(thread, file);
    if (!up.ok) return { error: up.error };
    const { error } = await db.from("messages").insert({ thread_id: thread, body: text || up.name, attachment_key: up.key, attachment_name: up.name });
    if (error) {
      await removeMessageFile(up.key);
      return { error: friendly(error.message, "We could not send that file. Try again.") };
    }
  } else {
    const { error } = await db.from("messages").insert({ thread_id: thread, body: text });
    if (error) return { error: "We could not send that. Try again." };
  }
  // The expert's three-pane view scrolls its own message list; the learner's page jumps to the newest.
  redirect(base === "/teach/messages" ? `${base}/${thread}` : `${base}/${thread}#latest`);
}

/** Called once a thread is on screen; marks everything up to now as read, for the unread count and the sender's ticks. */
export async function markThreadRead(threadId: string) {
  if (!hasSupabase || !/^[0-9a-f-]{36}$/.test(threadId)) return;
  const db = await serverClient();
  const { data } = await db.auth.getUser();
  if (!data.user) return;
  const now = new Date().toISOString();
  await Promise.all([
    db.from("thread_participants").update({ last_read_at: now }).eq("thread_id", threadId).eq("user_id", data.user.id),
    db.from("messages").update({ read_at: now }).eq("thread_id", threadId).neq("sender_user_id", data.user.id).is("read_at", null),
  ]);
}

/** Notes that the signed-in person is on Koobi now. The other side of a conversation sees it as "online". */
export async function touchPresence() {
  if (!hasSupabase) return;
  const db = await serverClient();
  await db.rpc("touch_presence");
}
