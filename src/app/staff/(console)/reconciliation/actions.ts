"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import { friendly } from "@/lib/db-error";

/** S15: run the checks; request, approve or reject a dual-control top-up of the provider balance. */

function to(key: "done" | "error", msg: string): never {
  redirect(`/staff/reconciliation?${key}=${encodeURIComponent(msg)}`);
}

export async function runNow() {
  await requireUser("/staff/reconciliation", { anyOf: ["finance", "admin"] });
  const db = await serverClient();
  const { error } = await db.rpc("run_reconciliation");
  if (error) to("error", friendly(error.message));
  to("done", "Reconciliation ran.");
}

export async function requestTopUp(form: FormData) {
  await requireUser("/staff/reconciliation", { anyOf: ["finance", "admin"] });
  const amount = Number(form.get("amount_kes"));
  const reason = String(form.get("reason") ?? "").trim();
  if (!Number.isInteger(amount) || amount < 1 || amount > 10_000_000) to("error", "Enter the shillings Koobi is adding.");
  if (reason.length < 5) to("error", "Say what the money covers.");
  const db = await serverClient();
  const { error } = await db.from("ledger_adjustment_requests").insert({
    reason: reason.slice(0, 1000),
    proposed_entries: [
      { account: "cash_provider", side: "debit", amount_kes: amount },
      { account: "adjustments", side: "credit", amount_kes: amount },
    ],
  });
  if (error) to("error", friendly(error.message));
  to("done", "Requested. A second person must approve it before it is posted.");
}

export async function decideAdjustment(form: FormData) {
  await requireUser("/staff/reconciliation", { anyOf: ["finance", "admin"] });
  const id = String(form.get("request_id") ?? "");
  const db = await serverClient();
  const { error } =
    form.get("decision") === "approve"
      ? await db.rpc("approve_adjustment", { p_request: id })
      : await db.rpc("reject_adjustment", { p_request: id, p_reason: String(form.get("reason") ?? "") });
  if (error) to("error", friendly(error.message));
  to("done", form.get("decision") === "approve" ? "Posted to the ledger." : "Rejected.");
}
