"use server";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { requireUser } from "@/lib/auth";
import { friendly } from "@/lib/db-error";
import { serverClient } from "@/lib/supabase/server";

export type StaffState = { error?: string };

const REVIEWERS = { anyOf: ["reviewer", "admin"] as ("reviewer" | "admin")[] };
const back = (id: string, done: string) => `/staff/applications/${id}?done=${done}`;

/** Picks the application up: Submitted becomes Under verification, and the applicant is told. */
export async function startVerification(form: FormData) {
  const id = String(form.get("teacher_id") ?? "");
  await requireUser(`/staff/applications/${id}`, REVIEWERS);
  const db = await serverClient();
  const { error } = await db.rpc("application_start_verification", { p_teacher: id });
  redirect(error ? `/staff/applications/${id}?error=${encodeURIComponent(friendly(error.message))}` : back(id, "started"));
}

/** One document or credential, verified on its own. Used during an application and for credentials sent later. */
export async function reviewDocument(_: StaffState, form: FormData): Promise<StaffState> {
  const id = String(form.get("credential_id") ?? "");
  const to = String(form.get("back") ?? "/staff/applications");
  await requireUser(to, REVIEWERS);
  const approve = form.get("decision") === "approve";
  const note = String(form.get("note") ?? "").trim();
  if (!approve && note.length < 5) return { error: "Say why it could not be verified. The expert sees this." };
  const db = await serverClient();
  const { error } = await db.rpc("review_credential", { p_credential: id, p_approve: approve, p_note: note || null });
  if (error) return { error: friendly(error.message) };
  updateTag("teachers");
  redirect(`${to}${to.includes("?") ? "&" : "?"}done=document`);
}

/** The email invitation to the 15-minute meeting. Date and time are entered in Nairobi time. */
export async function inviteMeeting(_: StaffState, form: FormData): Promise<StaffState> {
  const id = String(form.get("teacher_id") ?? "");
  await requireUser(`/staff/applications/${id}`, REVIEWERS);
  const date = String(form.get("date") ?? "");
  const time = String(form.get("time") ?? "");
  const link = String(form.get("link") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: "Choose the date and the time of the meeting." };
  if (!/^https:\/\/\S{8,290}$/.test(link)) return { error: "Paste the Google Meet or Zoom link, starting with https://" };
  const db = await serverClient();
  const { error } = await db.rpc("application_invite_meeting", { p_teacher: id, p_at: `${date}T${time}:00+03:00`, p_link: link });
  if (error) return { error: friendly(error.message) };
  redirect(back(id, "invited"));
}

export async function recordMeeting(_: StaffState, form: FormData): Promise<StaffState> {
  const id = String(form.get("teacher_id") ?? "");
  await requireUser(`/staff/applications/${id}`, REVIEWERS);
  const outcome = String(form.get("outcome") ?? "");
  const notes = String(form.get("notes") ?? "").trim();
  if (!["suitable", "not_suitable", "unsure"].includes(outcome)) return { error: "Choose the outcome of the meeting." };
  if (notes.length < 10) return { error: "Write what you observed. It is read at the final review." };
  const db = await serverClient();
  const { error } = await db.rpc("application_record_meeting", { p_teacher: id, p_outcome: outcome, p_notes: notes });
  if (error) return { error: friendly(error.message) };
  redirect(back(id, "recorded"));
}

/** Approve, reject, or return for more information. Approval opens the dashboard and publishes nothing. */
export async function decideApplication(_: StaffState, form: FormData): Promise<StaffState> {
  const id = String(form.get("teacher_id") ?? "");
  await requireUser(`/staff/applications/${id}`, REVIEWERS);
  const decision = String(form.get("decision") ?? "");
  const note = String(form.get("note") ?? "").trim();
  if (!["approve", "reject", "more_info"].includes(decision)) return { error: "Choose a decision." };
  if (decision !== "approve" && note.length < 10) return { error: "Write the reason (at least 10 characters). The expert reads it exactly as written." };
  const db = await serverClient();
  const { error } = await db.rpc("application_decide", { p_teacher: id, p_decision: decision, p_note: note || null });
  if (error) return { error: friendly(error.message) };
  redirect(back(id, decision));
}
