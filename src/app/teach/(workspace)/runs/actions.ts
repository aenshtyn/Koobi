"use server";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { friendly } from "@/lib/db-error";

/** Group dates (T13): the rules are in the database; these pass the form through. */

export type RunState = { error?: string; saved?: boolean };
const uuid = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "");
  return /^[0-9a-f-]{36}$/.test(s) ? s : null;
};

export async function createRun(_: RunState, form: FormData): Promise<RunState> {
  const offering = uuid(form.get("offering_id"));
  if (!hasSupabase || !offering) return { error: "Choose the learning experience." };
  const date = String(form.get("date") ?? "");
  const time = String(form.get("time") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: "Choose the date and time of the first session." };
  const start = new Date(`${date}T${time}:00+03:00`); // Nairobi time
  if (Number.isNaN(start.getTime())) return { error: "Choose the date and time of the first session." };
  const db = await serverClient();
  const { data, error } = await db.rpc("create_run", { p_offering: offering, p_first_start: start.toISOString() });
  if (error || !data) return { error: friendly(error?.message, "We could not add those dates.") };
  updateTag("offers");
  redirect(`/teach/runs/${data}?done=created`);
}

export async function runStep(_: RunState, form: FormData): Promise<RunState> {
  const run = uuid(form.get("run_id"));
  const step = String(form.get("step") ?? "");
  if (!hasSupabase || !run) return { error: "Not connected to the database." };
  const db = await serverClient();
  if (step === "open" || step === "confirm") {
    const { error } = await db.rpc(step === "open" ? "open_run" : "confirm_run", { p_run: run });
    if (error) return { error: friendly(error.message) };
    updateTag("offers");
    redirect(`/teach/runs/${run}?done=${step === "open" ? "opened" : "confirmed"}`);
  }
  if (step === "cancel") {
    const draft = form.get("draft") === "1";
    const reason = String(form.get("reason") ?? "").trim();
    if (!draft && reason.length < 5) return { error: "Tell the learners briefly why." };
    const { error } = await db.rpc("cancel_run", { p_run: run, p_reason: reason.slice(0, 200) || null });
    if (error) return { error: friendly(error.message) };
    updateTag("offers");
    redirect(draft ? "/teach/runs?done=removed" : `/teach/runs/${run}?done=cancelled`);
  }
  return { error: "That did not work. Try again." };
}

export async function setRunLink(_: RunState, form: FormData): Promise<RunState> {
  const run = uuid(form.get("run_id"));
  if (!hasSupabase || !run) return { error: "Not connected to the database." };
  const db = await serverClient();
  const { error } = await db.rpc("set_run_link", { p_run: run, p_link: String(form.get("link") ?? "").trim() });
  if (error) return { error: friendly(error.message) };
  return { saved: true };
}

export async function markRunSession(_: RunState, form: FormData): Promise<RunState> {
  const run = uuid(form.get("run_id"));
  const session = uuid(form.get("session_id"));
  if (!hasSupabase || !run || !session) return { error: "Not connected to the database." };
  const attendance: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (k.startsWith("att_") && typeof v === "string") attendance[k.slice(4)] = v;
  const covered = String(form.get("covered") ?? "").trim();
  if (covered.length < 10) return { error: "Say what you covered (at least 10 characters)." };
  const db = await serverClient();
  const { error } = await db.rpc("mark_run_session", {
    p_session: session,
    p_attendance: attendance,
    p_covered: covered.slice(0, 4000),
    p_progress: String(form.get("progress") ?? "").trim().slice(0, 4000) || null,
    p_next: String(form.get("next") ?? "").trim().slice(0, 4000) || null,
  });
  if (error) return { error: friendly(error.message) };
  redirect(`/teach/runs/${run}?done=marked`);
}
