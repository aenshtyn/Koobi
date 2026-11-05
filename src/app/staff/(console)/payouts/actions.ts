"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";
import { friendly } from "@/lib/db-error";
import { sendPayout, settlePayout } from "@/lib/payouts";

/**
 * S13. Building and approving run under the Finance member's own session (the database checks the
 * role and that two different people approve). Sending uses the service role only after that.
 */

function to(path: string, key: "done" | "error", msg: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(msg)}`);
}
const uuid = (v: FormDataEntryValue | null) => (/^[0-9a-f-]{36}$/.test(String(v ?? "")) ? String(v) : "");

export async function computeBatch() {
  await requireUser("/staff/payouts", { anyOf: ["finance", "admin"] });
  const db = await serverClient();
  const { data, error } = await db.rpc("compute_payout_batch");
  if (error) to("/staff/payouts", "error", friendly(error.message));
  redirect(`/staff/payouts/${data}?done=${encodeURIComponent("Batch built from released lessons up to now.")}`);
}

export async function approveBatch(form: FormData) {
  const id = uuid(form.get("batch_id"));
  await requireUser(`/staff/payouts/${id}`, { anyOf: ["finance", "admin"] });
  const db = await serverClient();
  const { data, error } = await db.rpc("approve_payout_batch", { p_batch: id });
  if (error) to(`/staff/payouts/${id}`, "error", friendly(error.message));
  to(`/staff/payouts/${id}`, "done", data === "first" ? "First approval recorded. A second person must approve." : "Approved by two people. You can send it now.");
}

export async function holdPayout(form: FormData) {
  const id = uuid(form.get("payout_id"));
  const batch = uuid(form.get("batch_id"));
  await requireUser(`/staff/payouts/${batch}`, { anyOf: ["finance", "admin"] });
  const db = await serverClient();
  const { error } = await db.rpc("exclude_payout", { p_payout: id, p_reason: String(form.get("reason") ?? "") });
  if (error) to(`/staff/payouts/${batch}`, "error", friendly(error.message));
  to(`/staff/payouts/${batch}`, "done", "Held back. The balance waits for next week.");
}

export async function sendBatch(form: FormData) {
  const batch = uuid(form.get("batch_id"));
  await requireUser(`/staff/payouts/${batch}`, { anyOf: ["finance", "admin"] });
  if (!hasAdmin) to(`/staff/payouts/${batch}`, "error", "Payouts are not switched on in this environment yet.");
  const db = await serverClient();
  const { data: b } = await db.from("payout_batches").select("status").eq("id", batch).maybeSingle();
  if (!b || !["approved", "sending"].includes(b.status)) to(`/staff/payouts/${batch}`, "error", "Only an approved batch can be sent.");
  const { data: payouts } = await adminClient().from("payouts").select("id").eq("batch_id", batch).eq("status", "approved");
  let sent = 0;
  const problems: string[] = [];
  for (const p of (payouts ?? []) as { id: string }[]) {
    const r = await sendPayout(p.id);
    if (r.ok) sent++;
    else problems.push(r.error);
  }
  if (problems.length) to(`/staff/payouts/${batch}`, "error", `${sent} sent; ${problems.length} failed: ${problems[0]}`);
  to(`/staff/payouts/${batch}`, "done", `${sent} ${sent === 1 ? "payout" : "payouts"} sent.`);
}

export async function checkPayout(form: FormData) {
  const id = uuid(form.get("payout_id"));
  const batch = uuid(form.get("batch_id"));
  await requireUser(`/staff/payouts/${batch}`, { anyOf: ["finance", "admin"] });
  const r = await settlePayout(id);
  to(`/staff/payouts/${batch}`, "done", r === "sent" ? "Paid." : r === "failed" ? "The transfer failed." : "Still with the provider.");
}

export async function retryPayout(form: FormData) {
  const id = uuid(form.get("payout_id"));
  const batch = uuid(form.get("batch_id"));
  await requireUser(`/staff/payouts/${batch}`, { anyOf: ["finance", "admin"] });
  const r = await sendPayout(id);
  if (!r.ok) to(`/staff/payouts/${batch}`, "error", r.error);
  to(`/staff/payouts/${batch}`, "done", r.outcome === "sent" ? "Paid." : "Sent again.");
}

export async function cancelPayout(form: FormData) {
  const id = uuid(form.get("payout_id"));
  const batch = uuid(form.get("batch_id"));
  await requireUser(`/staff/payouts/${batch}`, { anyOf: ["finance", "admin"] });
  const db = await serverClient();
  const { error } = await db.rpc("cancel_payout", { p_payout: id, p_reason: String(form.get("reason") ?? "") });
  if (error) to(`/staff/payouts/${batch}`, "error", friendly(error.message));
  to(`/staff/payouts/${batch}`, "done", "Cancelled. The balance joins next week’s batch.");
}
