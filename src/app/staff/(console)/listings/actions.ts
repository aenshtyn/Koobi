"use server";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { requireUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";

export type DecideState = { error?: string };

/**
 * Approve or reject a teacher profile or an offer (PRD FR-OFF-6). The database's transition table
 * allows these moves only for reviewer and admin, stamps reviewed_by, and writes the history and
 * the outbox event; this action adds the reason rule and refreshes Explore.
 */
export async function decideListing(_: DecideState, form: FormData): Promise<DecideState> {
  if (!hasSupabase) return { error: "Not connected to the database." };
  await requireUser("/staff/listings", { anyOf: ["reviewer", "admin"] });
  const kind = form.get("kind") === "teacher" ? "teachers" : "offerings";
  const id = String(form.get("id") ?? "");
  const decision = form.get("decision");
  const reason = String(form.get("reason") ?? "").trim();
  if (decision === "reject" && reason.length < 10) return { error: "Say what needs to change (at least 10 characters). The teacher sees this." };

  const db = await serverClient();
  const patch =
    decision === "approve"
      ? { listing_status: "approved" }
      : { listing_status: "rejected", rejection_reason: reason.slice(0, 1000) };
  const { data, error } = await db.from(kind).update(patch).eq("id", id).eq("listing_status", "pending_review").select("id");
  if (error) return { error: `That did not go through: ${error.message}` };
  if (!data?.length) return { error: "Someone else may have decided this already. Refresh the queue." };
  updateTag("offers");
  updateTag("teachers");
  redirect(`/staff/listings?done=${decision === "approve" ? "approved" : "rejected"}`);
}
