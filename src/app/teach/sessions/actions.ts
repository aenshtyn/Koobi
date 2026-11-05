"use server";
import { redirect } from "next/navigation";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { friendly } from "@/lib/db-error";

/** The teacher's lesson day (FR-SESS-2, -3) and replies (FR-REV-1). Rules live in the database. */

export type FormState = { error?: string };

const uuid = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "");
  return /^[0-9a-f-]{36}$/.test(s) ? s : null;
};

export async function lessonStep(_: FormState, form: FormData): Promise<FormState> {
  const session = uuid(form.get("session_id"));
  const step = String(form.get("step") ?? "");
  const fn = { in: "teacher_check_in", out: "teacher_check_out", absent: "report_learner_absent" }[step];
  if (!hasSupabase || !session || !fn) return { error: "Not connected to the database." };
  const db = await serverClient();
  const { error } = await db.rpc(fn, { p_session: session });
  if (error) return { error: friendly(error.message) };
  redirect(step === "out" ? `/teach/sessions/${session}/note` : `/teach/sessions/${session}?done=${step}`);
}

export async function fileNote(_: FormState, form: FormData): Promise<FormState> {
  const session = uuid(form.get("session_id"));
  if (!hasSupabase || !session) return { error: "Not connected to the database." };
  const covered = String(form.get("covered") ?? "").trim();
  if (covered.length < 10) return { error: "Say what you covered, in a sentence or two." };
  const db = await serverClient();
  const { error } = await db.rpc("file_lesson_note", {
    p_session: session,
    p_covered: covered.slice(0, 4000),
    p_progress: String(form.get("progress") ?? "").trim().slice(0, 4000),
    p_next: String(form.get("next_steps") ?? "").trim().slice(0, 4000),
  });
  if (error) return { error: friendly(error.message) };
  redirect(`/teach/sessions/${session}?done=note`);
}

export async function teacherCancel(_: FormState, form: FormData): Promise<FormState> {
  const booking = uuid(form.get("booking_id"));
  if (!hasSupabase || !booking) return { error: "Not connected to the database." };
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 5) return { error: "Tell the learner briefly why." };
  const db = await serverClient();
  const { error } = await db.rpc("teacher_cancel_booking", { p_booking: booking, p_reason: reason.slice(0, 200) });
  if (error) return { error: friendly(error.message) };
  redirect(`/teach/bookings/${booking}?done=cancelled`);
}

export async function replyToReview(_: FormState, form: FormData): Promise<FormState> {
  const review = uuid(form.get("review_id"));
  if (!hasSupabase || !review) return { error: "Not connected to the database." };
  const reply = String(form.get("reply") ?? "").trim();
  if (reply.length < 2) return { error: "Write a short reply." };
  const db = await serverClient();
  const { data, error } = await db.from("reviews").update({ teacher_reply: reply.slice(0, 1000) }).eq("id", review).select("id");
  if (error) return { error: friendly(error.message) };
  if (!data?.length) return { error: "You cannot reply to this review." };
  redirect("/teach/reviews?done=replied");
}
