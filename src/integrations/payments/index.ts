import "server-only";
import { paystack } from "./paystack";
import { sandbox } from "./sandbox";
import type { PaymentProvider } from "./types";
import { testLogins } from "@/lib/supabase/config";

/** Real Paystack when a secret key is set; otherwise the sandbox, only outside production or with test logins on. */
export function paymentProvider(): PaymentProvider | null {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (key) return paystack(key);
  if (process.env.NODE_ENV !== "production" || testLogins) return sandbox;
  return null;
}

/** Paystack needs an email for every customer; phone-only payers get an address on our own domain. */
export function payerEmail(userId: string) {
  return `payer-${userId.slice(0, 8)}@${process.env.PAYSTACK_EMAIL_DOMAIN ?? "payers.koobi.co.ke"}`;
}
