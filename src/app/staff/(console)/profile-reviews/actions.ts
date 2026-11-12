"use server";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { requireUser } from "@/lib/auth";
import { friendly } from "@/lib/db-error";
import { serverClient } from "@/lib/supabase/server";

export type ReviewState = { error?: string };
const REVIEWERS = { anyOf: ["reviewer", "admin"] as ("reviewer" | "admin")[] };

/** Approve an introduction video, ask for changes, or reject it. The expert sees the note. */
export async function reviewVideo(_: ReviewState, form: FormData): Promise<ReviewState> {
  await requireUser("/staff/profile-reviews", REVIEWERS);
  const decision = String(form.get("decision") ?? "");
  const note = String(form.get("note") ?? "").trim();
  if (!["approve", "changes", "reject"].includes(decision)) return { error: "Choose a decision." };
  if (decision !== "approve" && note.length < 5) return { error: "Say what needs to change. The expert sees this." };
  const db = await serverClient();
  const { error } = await db.rpc("review_video", { p_video: String(form.get("video_id") ?? ""), p_decision: decision, p_note: note || null });
  if (error) return { error: friendly(error.message) };
  updateTag("teachers");
  redirect("/staff/profile-reviews?done=video");
}

/** Approve or refuse a change to an approved expert's public information. Approving makes it live. */
export async function reviewChange(_: ReviewState, form: FormData): Promise<ReviewState> {
  await requireUser("/staff/profile-reviews", REVIEWERS);
  const approve = form.get("decision") === "approve";
  const note = String(form.get("note") ?? "").trim();
  if (!approve && note.length < 5) return { error: "Say why. The expert sees this." };
  const db = await serverClient();
  const { error } = await db.rpc("review_profile_change", { p_change: String(form.get("change_id") ?? ""), p_approve: approve, p_note: note || null });
  if (error) return { error: friendly(error.message) };
  updateTag("teachers");
  updateTag("offers");
  redirect("/staff/profile-reviews?done=change");
}
