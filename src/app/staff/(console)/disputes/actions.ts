"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { friendly } from "@/lib/db-error";
import { DISPUTE_OUTCOME_LABELS } from "@/domain/booking";

export type DecideState = { error?: string };

/** S12: record the outcome. public.resolve_dispute posts the ledger, logs the minutes and closes the case. */
export async function resolveDispute(_: DecideState, form: FormData): Promise<DecideState> {
  if (!hasSupabase) return { error: "Not connected to the database." };
  const id = String(form.get("dispute_id") ?? "");
  await requireUser(`/staff/disputes/${id}`, { anyOf: ["concierge", "finance", "admin"] });
  const outcome = String(form.get("outcome") ?? "");
  const note = String(form.get("note") ?? "").trim();
  const minutes = Number(form.get("minutes"));
  const credit = Number(form.get("credit_kes") || 0);
  if (!(outcome in DISPUTE_OUTCOME_LABELS)) return { error: "Choose an outcome." };
  if (note.length < 10) return { error: "Write the reason both sides will see (at least 10 characters)." };
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return { error: "Log the minutes you spent (1 to 1440)." };
  if (outcome === "partial_refund" && (!Number.isInteger(credit) || credit < 1)) return { error: "Enter the shillings to credit back." };
  const db = await serverClient();
  const { error } = await db.rpc("resolve_dispute", {
    p_dispute: id,
    p_outcome: outcome,
    p_credit_kes: outcome === "partial_refund" ? credit : null,
    p_note: note.slice(0, 1000),
    p_minutes: minutes,
  });
  if (error) return { error: friendly(error.message) };
  redirect(`/staff/disputes/${id}?done=1`);
}
