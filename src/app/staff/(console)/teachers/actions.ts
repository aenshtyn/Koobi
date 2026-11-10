"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import { friendly } from "@/lib/db-error";

/** S18 and S8: account status (admin only, enforced by the state machine) and the founding-member list. */

function to(path: string, key: "done" | "error", msg: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(msg)}`);
}

export async function setTeacherStatus(form: FormData) {
  await requireUser("/staff/teachers", { anyOf: ["admin"] });
  const id = String(form.get("teacher_id") ?? "");
  const status = String(form.get("status") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!["suspended", "applied", "offboarded"].includes(status)) to("/staff/teachers", "error", "Choose an action.");
  if (reason.length < 5) to("/staff/teachers", "error", "Write the reason; it is kept with the account.");
  const db = await serverClient();
  const { error } =
    status === "applied"
      ? await db.rpc("reinstate_teacher", { p_teacher: id, p_reason: reason })
      : await db.from("teachers").update({ status, status_reason: reason.slice(0, 300) }).eq("id", id);
  if (error) to("/staff/teachers", "error", friendly(error.message));
  to("/staff/teachers", "done", status === "suspended" ? "Suspended. Their learning experiences are hidden." : status === "offboarded" ? "Offboarded." : "Reinstated.");
}

export async function setWaitlist(form: FormData) {
  await requireUser("/staff/waitlist", { anyOf: ["concierge", "admin"] });
  const teacher = String(form.get("teacher_id") ?? "");
  const track = String(form.get("track") ?? "");
  const to_ = String(form.get("to") ?? "");
  if (!["waitlisted", "released"].includes(to_)) to("/staff/waitlist", "error", "Choose an action.");
  const db = await serverClient();
  const { error } = await db
    .from("teacher_tracks")
    .update({ waitlist_status: to_, ...(to_ === "released" ? { released_at: new Date().toISOString() } : {}) })
    .eq("teacher_id", teacher)
    .eq("track", track);
  if (error) to("/staff/waitlist", "error", friendly(error.message));
  to("/staff/waitlist", "done", to_ === "released" ? "Released: their learning experiences on this track are visible." : "Added to the founding-member list.");
}
