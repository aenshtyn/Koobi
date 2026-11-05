import "server-only";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";
import { paymentProvider } from "@/integrations/payments";
import { decryptField } from "@/lib/crypto";

/**
 * Payout execution (FR-PAYOUT-2, §9.7). Finance approves in the database (two people); only then does
 * the service role ask the provider to send. The payout id is the transfer reference, so a retry can
 * never pay twice. Money is recorded as paid only after the provider confirms.
 */

/** Test payout amount that proves a payout number (FR-VER-2) [assumption]. */
export const TEST_PAYOUT_KES = 10;

type Teacher = { id: string; display_name: string; payout_phone_enc: string | null };

async function teacherFor(id: string): Promise<Teacher | null> {
  const { data } = await adminClient().from("teachers").select("id, display_name, payout_phone_enc").eq("id", id).maybeSingle();
  return (data as Teacher | null) ?? null;
}

export async function sendPayout(payoutId: string): Promise<{ ok: true; outcome: "sent" | "sending" } | { ok: false; error: string }> {
  const provider = paymentProvider();
  if (!provider || !hasAdmin) return { ok: false, error: "Payments are not switched on in this environment yet." };
  const admin = adminClient();
  const { data: po } = await admin.from("payouts").select("id, teacher_id, net_kes, status").eq("id", payoutId).maybeSingle();
  if (!po) return { ok: false, error: "Payout not found." };
  if (!["approved", "failed", "parked"].includes(po.status)) return { ok: false, error: `This payout is ${po.status}.` };
  const t = await teacherFor(po.teacher_id);
  const phone = decryptField(t?.payout_phone_enc);
  if (!t || !phone) return { ok: false, error: "The teacher has no payout number on file." };

  const { error: markErr } = await admin.rpc("mark_payout_sending", { p_payout: po.id, p_provider_ref: null });
  if (markErr) return { ok: false, error: markErr.message };
  const sent = await provider.transfer({ reference: po.id, amountKes: po.net_kes, phone, name: t.display_name, reason: "Koobi weekly payout" });
  if (!sent.ok) {
    await admin.rpc("record_payout_failure", { p_payout: po.id, p_reason: sent.reason });
    return { ok: false, error: sent.reason };
  }
  if (sent.status === "success") {
    const { error } = await admin.rpc("record_payout_sent", { p_payout: po.id, p_provider_ref: sent.providerRef, p_fee_kes: sent.feeKes });
    if (error) return { ok: false, error: error.message };
    return { ok: true, outcome: "sent" };
  }
  await admin.from("payouts").update({ provider_ref: sent.providerRef }).eq("id", po.id);
  return { ok: true, outcome: "sending" };
}

/** Re-fetch a sending payout from the provider and record the result. Safe to repeat. */
export async function settlePayout(payoutId: string): Promise<"sent" | "sending" | "failed"> {
  const provider = paymentProvider();
  if (!provider || !hasAdmin) return "sending";
  const admin = adminClient();
  const { data: po } = await admin.from("payouts").select("id, status, provider_ref").eq("id", payoutId).maybeSingle();
  if (!po) return "sending";
  if (po.status === "sent") return "sent";
  if (po.status !== "sending") return po.status === "failed" || po.status === "parked" ? "failed" : "sending";
  const check = await provider.checkTransfer(po.id);
  if (check.status === "success") {
    const { error } = await admin.rpc("record_payout_sent", { p_payout: po.id, p_provider_ref: po.provider_ref, p_fee_kes: check.feeKes });
    if (error) throw new Error(`record_payout_sent: ${error.message}`);
    return "sent";
  }
  if (check.status === "failed") {
    await admin.rpc("record_payout_failure", { p_payout: po.id, p_reason: check.reason });
    return "failed";
  }
  return "sending";
}

/** FR-VER-2: a small transfer to the new number; the reviewer compares the M-Pesa name with the ID. */
export async function sendTestPayout(checkId: string, teacherId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const provider = paymentProvider();
  if (!provider || !hasAdmin) return { ok: false, error: "Payments are not switched on in this environment yet." };
  const t = await teacherFor(teacherId);
  const phone = decryptField(t?.payout_phone_enc);
  if (!t || !phone) return { ok: false, error: "Save your payout number first." };
  const sent = await provider.transfer({ reference: `test-${checkId}`, amountKes: TEST_PAYOUT_KES, phone, name: t.display_name, reason: "Koobi payout number check" });
  if (!sent.ok) return { ok: false, error: sent.reason };
  const { error } = await adminClient().rpc("record_test_payout", {
    p_check: checkId,
    p_amount_kes: TEST_PAYOUT_KES,
    p_fee_kes: sent.feeKes ?? 0,
    p_provider_ref: sent.providerRef,
    p_recipient_name: sent.recipientName,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Webhook path for transfer.* events: our reference is the payout id. */
export async function settleTransferWebhook(reference: string): Promise<"processed" | "ignored"> {
  if (!/^[0-9a-f-]{36}$/.test(reference)) return "ignored"; // test payouts are recorded when sent
  await settlePayout(reference);
  return "processed";
}
