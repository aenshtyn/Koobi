import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentProvider, StartResult, Verification } from "./types";

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
  };
}
