import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentProvider, RefundCheck, RefundStart, StartResult, TransferCheck, TransferStart, Verification } from "./types";

/**
 * Paystack Kenya: M-Pesa STK push through the Charge API, cards through the hosted checkout,
 * and server-side verification of every transaction before money is recorded (§9.7).
 * Amounts go to Paystack in the currency's subunit (KES × 100).
 */
const API = "https://api.paystack.co";

export const toSubunits = (kes: number) => Math.round(kes * 100);
export const fromSubunits = (units: number) => Math.round(units / 100);

/** Webhook authenticity: HMAC-SHA512 of the raw body with the secret key, hex, in x-paystack-signature. */
export function verifyPaystackSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Paystack wants +254… for Kenyan mobile money. */
export function mpesaPhone(e164: string) {
  return e164.startsWith("+") ? e164 : `+${e164}`;
}

async function call<T>(secret: string, path: string, init?: RequestInit): Promise<{ status: boolean; message: string; data: T }> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({ status: false, message: `HTTP ${res.status}` }))) as { status: boolean; message: string; data: T };
  return json;
}

export function paystack(secret: string): PaymentProvider {
  return {
    name: "paystack",
    async startMpesa({ reference, amountKes, phone, email }): Promise<StartResult> {
      const r = await call<{ reference: string; status: string; display_text?: string }>(secret, "/charge", {
        method: "POST",
        body: JSON.stringify({
          email,
          amount: toSubunits(amountKes),
          currency: "KES",
          reference,
          mobile_money: { phone: mpesaPhone(phone), provider: "mpesa" },
        }),
      });
      if (!r.status || r.data?.status === "failed") return { ok: false, reason: r.message || "The M-Pesa request was refused." };
      return { ok: true, providerRef: r.data?.reference ?? reference, displayText: r.data?.display_text ?? "Check your phone for the M-Pesa prompt." };
    },
    async startCard({ reference, amountKes, email, callbackUrl }): Promise<StartResult> {
      const r = await call<{ authorization_url: string; reference: string }>(secret, "/transaction/initialize", {
        method: "POST",
        body: JSON.stringify({ email, amount: toSubunits(amountKes), currency: "KES", reference, callback_url: callbackUrl, channels: ["card"] }),
      });
      if (!r.status || !r.data?.authorization_url) return { ok: false, reason: r.message || "The card page could not be opened." };
      return { ok: true, providerRef: r.data.reference, displayText: "Opening the secure card page.", redirectUrl: r.data.authorization_url };
    },
    async verify(reference): Promise<Verification> {
      const r = await call<{ id: number; status: string; amount: number; fees: number | null; currency: string; gateway_response?: string }>(
        secret,
        `/transaction/verify/${encodeURIComponent(reference)}`,
      );
      if (!r.status || !r.data) return { status: "pending" };
      if (r.data.status === "success") {
        return { status: "success", providerRef: String(r.data.id), amountKes: fromSubunits(r.data.amount), feeKes: fromSubunits(r.data.fees ?? 0), currency: r.data.currency };
      }
      if (["failed", "abandoned", "reversed"].includes(r.data.status)) return { status: "failed", reason: r.data.gateway_response ?? r.data.status };
      return { status: "pending" };
    },
    async refund({ reference, amountKes, note }): Promise<RefundStart> {
      const r = await call<{ id: number; status: string }>(secret, "/refund", {
        method: "POST",
        body: JSON.stringify({ transaction: reference, amount: toSubunits(amountKes), currency: "KES", merchant_note: note.slice(0, 200) }),
      });
      if (!r.status || !r.data?.id) return { ok: false, reason: r.message || "The refund was refused." };
      return { ok: true, providerRef: String(r.data.id) };
    },
    async checkRefund(providerRef): Promise<RefundCheck> {
      const r = await call<{ status: string }>(secret, `/refund/${encodeURIComponent(providerRef)}`);
      return refundStatus(r.status ? r.data?.status : undefined);
    },
    async transfer({ reference, amountKes, phone, name, reason }): Promise<TransferStart> {
      // Recipient first (M-Pesa mobile money), then the transfer from the Paystack balance.
      const rec = await call<{ recipient_code: string; details?: { account_name?: string | null } }>(secret, "/transferrecipient", {
        method: "POST",
        body: JSON.stringify({ type: "mobile_money", name, account_number: localPhone(phone), bank_code: "MPESA", currency: "KES" }),
      });
      if (!rec.status || !rec.data?.recipient_code) return { ok: false, reason: rec.message || "The M-Pesa number was not accepted." };
      const t = await call<{ transfer_code: string; status: string; fee_charged?: number }>(secret, "/transfer", {
        method: "POST",
        body: JSON.stringify({ source: "balance", amount: toSubunits(amountKes), recipient: rec.data.recipient_code, reference, reason: reason.slice(0, 100), currency: "KES" }),
      });
      if (!t.status || !t.data) return { ok: false, reason: t.message || "The transfer was refused." };
      if (["failed", "reversed", "rejected"].includes(t.data.status)) return { ok: false, reason: `Transfer ${t.data.status}.` };
      return {
        ok: true,
        providerRef: t.data.transfer_code,
        status: t.data.status === "success" ? "success" : "pending",
        recipientName: rec.data.details?.account_name ?? null,
        feeKes: typeof t.data.fee_charged === "number" ? fromSubunits(t.data.fee_charged) : null,
      };
    },
    async checkTransfer(reference): Promise<TransferCheck> {
      const r = await call<{ status: string; fee_charged?: number; reason?: string }>(secret, `/transfer/verify/${encodeURIComponent(reference)}`);
      return transferStatus(r.status ? r.data?.status : undefined, r.data?.fee_charged);
    },
  };
}

/** Paystack wants the local form (07… / 01…) for M-Pesa recipients. */
export function localPhone(e164: string) {
  const digits = e164.replace(/\D/g, "");
  return digits.startsWith("254") ? `0${digits.slice(3)}` : digits;
}

/** Paystack transfer states: pending, otp, received, success, failed, reversed, abandoned, blocked, rejected. */
export function transferStatus(status: string | undefined, feeSubunits?: number): TransferCheck {
  if (status === "success") return { status: "success", feeKes: typeof feeSubunits === "number" ? fromSubunits(feeSubunits) : null };
  if (status && ["failed", "reversed", "abandoned", "blocked", "rejected"].includes(status)) return { status: "failed", reason: `Transfer ${status}.` };
  return { status: "pending" };
}

/** Paystack refund states: pending, processing, needs-attention, processed, failed. */
export function refundStatus(status: string | undefined): RefundCheck {
  if (status === "processed") return { status: "processed" };
  if (status === "failed") return { status: "failed", reason: "The provider could not complete the refund." };
  return { status: "pending" };
}
