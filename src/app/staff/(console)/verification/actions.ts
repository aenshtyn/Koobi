"use server";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { requireUser } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import { friendly } from "@/lib/db-error";
import { openDocument } from "@/lib/documents";

export type ReviewState = { error?: string };

/** S4: pass or fail a check. public.review_check logs the minutes, recomputes the tier and audits it. */
export async function reviewCheck(_: ReviewState, form: FormData): Promise<ReviewState> {
  const id = String(form.get("check_id") ?? "");
  await requireUser(`/staff/verification/${id}`, { anyOf: ["reviewer", "admin"] });
  const pass = form.get("decision") === "pass";
  const note = String(form.get("note") ?? "").trim();
  const minutes = Number(form.get("minutes"));
  const expires = String(form.get("expires_on") ?? "").trim();
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return { error: "Log the minutes you spent (1 to 1440)." };
  if (!pass && note.length < 5) return { error: "Say why it did not pass. The teacher sees this." };
  if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) return { error: "Use a date for the expiry." };
  const db = await serverClient();
  const { error } = await db.rpc("review_check", { p_check: id, p_pass: pass, p_note: note || null, p_minutes: minutes, p_expires_on: expires || null });
  if (error) return { error: friendly(error.message) };
  // Badges and tiers show on Explore, offer and teacher pages (cached).
  updateTag("offers");
  updateTag("teachers");
  redirect(`/staff/verification?done=${pass ? "passed" : "failed"}`);
}

/** Opens a document through a logged, one-minute signed link. */
export async function viewDocument(form: FormData) {
  const id = String(form.get("document_id") ?? "");
  const check = String(form.get("check_id") ?? "");
  await requireUser(`/staff/verification/${check}`, { anyOf: ["reviewer", "admin"] });
  const r = await openDocument(id);
  if (!r.ok) redirect(`/staff/verification/${check}?error=${encodeURIComponent(r.error)}`);
  redirect(r.url);
}
