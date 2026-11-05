"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";
import { friendly } from "@/lib/db-error";
import { sendRefund, settleRefund } from "@/lib/refunds";

/**
 * S14. Finance approves under their own session (row-level security and the refund state machine
 * check the role). Only then does the service role talk to the provider. A transfer refund (credit
 * that came from earlier credit) is sent by hand and recorded with its M-Pesa code.
 */

const back = (msg: string, error = false) => redirect(`/staff/refunds?${error ? "error" : "done"}=${encodeURIComponent(msg)}`);
const uuid = (v: FormDataEntryValue | null) => (/^[0-9a-f-]{36}$/.test(String(v ?? "")) ? String(v) : null);

export async function approveRefund(form: FormData) {
  const id = uuid(form.get("refund_id"));
  const user = await requireUser("/staff/refunds", { anyOf: ["finance", "admin"] });
  if (!hasSupabase || !id) back("Refund not found.", true);
  const db = await serverClient();
  const { data, error } = await db.from("refunds").update({ status: "approved", approved_by: user.id }).eq("id", id!).eq("status", "requested").select("id, method");
  if (error) back(friendly(error.message), true);
  if (!data?.length) back("This refund is no longer waiting for approval.", true);
  if (data![0].method === "transfer") back("Approved. Send it by M-Pesa, then record the transaction code.");
  const sent = await sendRefund(id!);
  if (!sent.ok) back(sent.error, true);
  back(sent.ok && sent.outcome === "succeeded" ? "Approved and refunded." : "Approved and sent to the provider. It shows as refunded once they confirm.");
}

export async function retryRefund(form: FormData) {
  const id = uuid(form.get("refund_id"));
  await requireUser("/staff/refunds", { anyOf: ["finance", "admin"] });
  if (!id) back("Refund not found.", true);
  const sent = await sendRefund(id!);
  if (!sent.ok) back(sent.error, true);
  back("Sent again.");
}

export async function checkRefund(form: FormData) {
  const id = uuid(form.get("refund_id"));
  await requireUser("/staff/refunds", { anyOf: ["finance", "admin"] });
  if (!id) back("Refund not found.", true);
  const outcome = await settleRefund(id!);
  back(outcome === "succeeded" ? "Refunded." : outcome === "failed" ? "The provider could not complete it. Try again." : "Still with the provider.");
}

export async function recordTransfer(form: FormData) {
  const id = uuid(form.get("refund_id"));
  await requireUser("/staff/refunds", { anyOf: ["finance", "admin"] });
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  if (!id || !/^[A-Z0-9]{8,12}$/.test(code)) back("Enter the M-Pesa transaction code, like SFT4XY12AB.", true);
  if (!hasAdmin) back("Payments are not switched on in this environment yet.", true);
  const db = await serverClient();
  const { data: r } = await db.from("refunds").select("id, status, method").eq("id", id!).maybeSingle();
  if (!r || r.method !== "transfer" || r.status !== "approved") back("Only an approved transfer can be recorded.", true);
  const admin = adminClient();
  const pending = await admin.rpc("mark_refund_pending", { p_refund: id, p_provider_ref: code });
  if (pending.error) back(friendly(pending.error.message), true);
  const done = await admin.rpc("record_refund_success", { p_refund: id, p_provider_ref: code, p_fee_kes: 0 });
  if (done.error) back(friendly(done.error.message), true);
  back("Transfer recorded.");
}
