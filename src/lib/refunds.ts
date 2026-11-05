import "server-only";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";
import { paymentProvider } from "@/integrations/payments";

/**
 * Refund execution (FR-PAY-6, §9.7). Finance approves under their own session; sending to the
 * provider and recording the result run with the service role. A refund is recorded as done only
 * after the provider says so, re-fetched rather than read from a webhook body.
 */

type RefundRow = { id: string; status: string; amount_kes: number; platform_ref: string; provider_ref: string | null; payment: { platform_ref: string } | null };

async function load(id: string): Promise<RefundRow | null> {
  const { data } = await adminClient()
    .from("refunds")
    .select("id, status, amount_kes, platform_ref, provider_ref, payment:payments(platform_ref)")
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as RefundRow | null) ?? null;
}

export async function sendRefund(id: string): Promise<{ ok: true; outcome: "succeeded" | "pending" } | { ok: false; error: string }> {
  const provider = paymentProvider();
  if (!provider || !hasAdmin) return { ok: false, error: "Payments are not switched on in this environment yet." };
  const r = await load(id);
  if (!r || !r.payment) return { ok: false, error: "Refund not found." };
  if (r.status !== "approved" && r.status !== "failed") return { ok: false, error: `This refund is ${r.status}.` };
  const admin = adminClient();
  const started = await provider.refund({ reference: r.payment.platform_ref, amountKes: r.amount_kes, note: `Koobi refund ${r.platform_ref}` });
  if (!started.ok) {
    await admin.rpc("record_refund_failure", { p_refund: r.id, p_reason: started.reason });
    return { ok: false, error: `${started.reason} The refund is marked failed; you can try again.` };
  }
  const { error } = await admin.rpc("mark_refund_pending", { p_refund: r.id, p_provider_ref: started.providerRef });
  if (error) return { ok: false, error: error.message };
  return { ok: true, outcome: await settleRefund(r.id) === "succeeded" ? "succeeded" : "pending" };
}

/** Ask the provider where a pending refund stands and record the answer. Safe to repeat. */
export async function settleRefund(id: string): Promise<"succeeded" | "pending" | "failed"> {
  const provider = paymentProvider();
  if (!provider || !hasAdmin) return "pending";
  const r = await load(id);
  if (!r) return "pending";
  if (r.status === "succeeded") return "succeeded";
  if (r.status !== "pending" || !r.provider_ref) return r.status === "failed" ? "failed" : "pending";
  const check = await provider.checkRefund(r.provider_ref);
  const admin = adminClient();
  if (check.status === "processed") {
    const { error } = await admin.rpc("record_refund_success", { p_refund: r.id, p_provider_ref: r.provider_ref, p_fee_kes: 0 });
    if (error) throw new Error(`record_refund_success: ${error.message}`);
    return "succeeded";
  }
  if (check.status === "failed") {
    await admin.rpc("record_refund_failure", { p_refund: r.id, p_reason: check.reason });
    return "failed";
  }
  return "pending";
}

/** Webhook path: find our refund by the provider's refund id. */
export async function refundIdForProviderRef(providerRef: string): Promise<string | null> {
  const { data } = await adminClient().from("refunds").select("id").eq("provider_ref", providerRef).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
