import "server-only";
import { createHash } from "node:crypto";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";
import { paymentProvider, payerEmail } from "@/integrations/payments";
import { SANDBOX_FEE_RATE } from "@/integrations/payments/sandbox";
import { verifyPaystackSignature } from "@/integrations/payments/paystack";
import { refundIdForProviderRef, settleRefund } from "@/lib/refunds";
import { settleTransferWebhook } from "@/lib/payouts";

/**
 * Checkout and settlement (PRD §3.6, FR-PAY, §9.7). The payer creates the payment under their own
 * session (row-level security and the amount trigger decide what it is worth). Everything after
 * that runs with the service role: telling the provider, recording success or failure, posting
 * the hold. A payment only succeeds after the transaction is re-fetched from the provider and its
 * amount and currency match.
 */

export type PaymentRow = {
  id: string;
  booking_id: string | null;
  platform_ref: string;
  provider: string;
  provider_ref: string | null;
  method: string;
  amount_kes: number;
  fee_kes: number;
  status: string;
  failure_reason: string | null;
  created_at: string;
  succeeded_at: string | null;
};

export type StartOutcome = { ok: true; redirectUrl?: string } | { ok: false; error: string };

export async function startCheckout(opts: { bookingId: string; method: "mpesa_stk" | "card"; phone?: string; callbackUrl: string }): Promise<StartOutcome> {
  const provider = paymentProvider();
  if (!provider || !hasAdmin) return { ok: false, error: "Payments are not switched on in this environment yet." };
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { ok: false, error: "Sign in again to pay." };

  const { data: booking } = await db.from("bookings").select("id, status").eq("id", opts.bookingId).maybeSingle();
  if (!booking) return { ok: false, error: "Booking not found." };
  if (booking.status === "requested") {
    const { error } = await db.from("bookings").update({ status: "awaiting_payment" }).eq("id", booking.id);
    if (error) return { ok: false, error: error.message };
  } else if (booking.status !== "awaiting_payment") {
    return { ok: false, error: "This booking is already paid or closed." };
  }

  const { data: payment, error } = await db
    .from("payments")
    .insert({ booking_id: booking.id, method: opts.method })
    .select("id, platform_ref, amount_kes")
    .single();
  if (error || !payment) return { ok: false, error: error?.message ?? "Could not start the payment." };

  const email = payerEmail(auth.user.id);
  const started =
    opts.method === "mpesa_stk"
      ? await provider.startMpesa({ reference: payment.platform_ref, amountKes: payment.amount_kes, phone: opts.phone ?? "", email })
      : await provider.startCard({ reference: payment.platform_ref, amountKes: payment.amount_kes, email, callbackUrl: opts.callbackUrl });

  const admin = adminClient();
  if (!started.ok) {
    await admin.rpc("record_payment_failure", { p_payment: payment.id, p_reason: started.reason });
    return { ok: false, error: `${started.reason} Nothing was charged.` };
  }
  await admin.rpc("mark_payment_pending", { p_payment: payment.id, p_provider_ref: started.providerRef });
  return { ok: true, redirectUrl: started.redirectUrl };
}

/** Latest payment for a booking, read as the payer. */
export async function latestPayment(bookingId: string): Promise<PaymentRow | null> {
  const db = await serverClient();
  const { data } = await db
    .from("payments")
    .select("id, booking_id, platform_ref, provider, provider_ref, method, amount_kes, fee_kes, status, failure_reason, created_at, succeeded_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PaymentRow | null) ?? null;
}

/**
 * Re-fetch a pending payment from the provider and record the outcome. Used by the status page (so a
 * missed webhook never strands a payer) and by the webhook handler. Safe to call any number of times.
 */
export async function settle(paymentId: string): Promise<"succeeded" | "failed" | "pending" | "mismatch"> {
  const provider = paymentProvider();
  if (!provider || provider.name === "sandbox" || !hasAdmin) return "pending";
  const admin = adminClient();
  const { data: p } = await admin.from("payments").select("id, platform_ref, amount_kes, status").eq("id", paymentId).maybeSingle();
  if (!p) return "pending";
  if (p.status === "succeeded") return "succeeded";
  if (p.status === "failed") return "failed";
  const v = await provider.verify(p.platform_ref);
  if (v.status === "pending") return "pending";
  if (v.status === "failed") {
    await admin.rpc("record_payment_failure", { p_payment: p.id, p_reason: v.reason });
    return "failed";
  }
  if (v.currency !== "KES" || v.amountKes !== p.amount_kes) {
    // Never record a payment whose amount or currency differs from what was asked; Finance reviews it.
    await admin.from("provider_events").insert({
      provider: "paystack",
      event_id: `mismatch:${p.platform_ref}`,
      event_type: "verify.mismatch",
      raw_body: JSON.stringify(v),
      status: "parked",
      payment_id: p.id,
    });
    return "mismatch";
  }
  const { error } = await admin.rpc("record_payment_success", {
    p_payment: p.id,
    p_provider_ref: v.providerRef,
    p_fee_kes: v.feeKes,
    p_settled_kes: v.amountKes - v.feeKes,
  });
  if (error) throw new Error(`record_payment_success: ${error.message}`);
  return "succeeded";
}

/** Sandbox only: the payer "entered their PIN". Records through the same function as a real webhook. */
export async function simulateSandboxPayment(paymentId: string, outcome: "success" | "failure") {
  const provider = paymentProvider();
  if (provider?.name !== "sandbox" || !hasAdmin) throw new Error("The payment simulator only runs in the sandbox.");
  const admin = adminClient();
  const { data: p } = await admin.from("payments").select("id, amount_kes, provider_ref").eq("id", paymentId).maybeSingle();
  if (!p) throw new Error("Payment not found.");
  if (outcome === "failure") {
    await admin.rpc("record_payment_failure", { p_payment: p.id, p_reason: "Sandbox: cancelled on the phone" });
    return;
  }
  const fee = Math.round(p.amount_kes * SANDBOX_FEE_RATE);
  const { error } = await admin.rpc("record_payment_success", { p_payment: p.id, p_provider_ref: p.provider_ref, p_fee_kes: fee, p_settled_kes: p.amount_kes - fee });
  if (error) throw new Error(error.message);
}

/**
 * Webhook ingress (§9.7): verify the signature, store the raw event once (provider + event id are
 * unique), then settle by re-fetching the transaction. Returns the HTTP status to send back.
 */
export async function ingestPaystackWebhook(raw: string, signature: string | null): Promise<number> {
  const secret = process.env.PAYSTACK_SECRET_KEY ?? "";
  if (!secret || !hasAdmin) return 503;
  const valid = verifyPaystackSignature(raw, signature, secret);
  let body: { event?: string; data?: { id?: number | string; reference?: string } } = {};
  try {
    body = JSON.parse(raw);
  } catch {
    return 400;
  }
  const eventId = body.data?.id ? `${body.event}:${body.data.id}` : createHash("sha256").update(raw).digest("hex");
  const admin = adminClient();
  const { data: stored, error } = await admin
    .from("provider_events")
    .insert({ provider: "paystack", event_id: eventId, event_type: body.event ?? null, raw_body: raw, signature_valid: valid, status: valid ? "processing" : "ignored" })
    .select("id")
    .maybeSingle();
  if (error) return error.code === "23505" ? 200 : 500; // duplicate delivery: already handled
  if (!valid) return 401;

  if (body.event?.startsWith("transfer.") && body.data?.reference) {
    try {
      const outcome = await settleTransferWebhook(body.data.reference);
      await admin.from("provider_events").update({ status: outcome, processed_at: new Date().toISOString() }).eq("id", stored!.id);
      return 200;
    } catch (e) {
      await admin.from("provider_events").update({ status: "failed", last_error: String(e), attempts: 1 }).eq("id", stored!.id);
      return 500;
    }
  }

  if (body.event?.startsWith("refund.") && body.data?.id) {
    const refundId = await refundIdForProviderRef(String(body.data.id));
    if (!refundId) {
      await admin.from("provider_events").update({ status: "parked", last_error: "unknown refund" }).eq("id", stored!.id);
      return 200;
    }
    try {
      await settleRefund(refundId);
      await admin.from("provider_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", stored!.id);
      return 200;
    } catch (e) {
      await admin.from("provider_events").update({ status: "failed", last_error: String(e), attempts: 1 }).eq("id", stored!.id);
      return 500;
    }
  }

  const reference = body.data?.reference;
  if (!reference || !body.event?.startsWith("charge.")) {
    await admin.from("provider_events").update({ status: "ignored", processed_at: new Date().toISOString() }).eq("id", stored!.id);
    return 200;
  }
  const { data: payment } = await admin.from("payments").select("id").eq("platform_ref", reference).maybeSingle();
  if (!payment) {
    await admin.from("provider_events").update({ status: "parked", last_error: "unknown reference" }).eq("id", stored!.id);
    return 200;
  }
  try {
    const outcome = await settle(payment.id);
    await admin
      .from("provider_events")
      .update({ status: outcome === "mismatch" ? "parked" : "processed", payment_id: payment.id, processed_at: new Date().toISOString() })
      .eq("id", stored!.id);
    return 200;
  } catch (e) {
    await admin.from("provider_events").update({ status: "failed", last_error: String(e), attempts: 1 }).eq("id", stored!.id);
    return 500;
  }
}
