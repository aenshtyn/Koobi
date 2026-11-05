"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { normaliseKenyanPhone } from "@/domain/format";
import { simulateSandboxPayment, startCheckout } from "@/lib/payments";
import { serverClient } from "@/lib/supabase/server";
import { friendly } from "@/lib/db-error";

export type PayState = { error?: string };

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function payWithMpesa(_: PayState, form: FormData): Promise<PayState> {
  const id = String(form.get("booking_id") ?? "");
  const phone = normaliseKenyanPhone(String(form.get("phone") ?? ""));
  if (!phone) return { error: "Enter the Safaricom number that will pay, like 0712 345 678." };
  const r = await startCheckout({ bookingId: id, method: "mpesa_stk", phone, callbackUrl: `${await origin()}/checkout/${id}/status` });
  if (!r.ok) return { error: r.error };
  redirect(`/checkout/${id}/status`);
}

export async function payWithCard(form: FormData) {
  const id = String(form.get("booking_id") ?? "");
  const r = await startCheckout({ bookingId: id, method: "card", callbackUrl: `${await origin()}/checkout/${id}/status` });
  if (!r.ok) redirect(`/checkout/${id}/pay?error=${encodeURIComponent(r.error)}`);
  redirect(r.redirectUrl ?? `/checkout/${id}/status`);
}

export async function simulatePayment(form: FormData) {
  const id = String(form.get("booking_id") ?? "");
  await simulateSandboxPayment(String(form.get("payment_id") ?? ""), form.get("outcome") === "failure" ? "failure" : "success");
  redirect(`/checkout/${id}/status`);
}

/** Pay the whole lesson from credit (FR-PAY-6). The database checks the balance and spends it. */
export async function payWithCredit(form: FormData) {
  const id = String(form.get("booking_id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) redirect("/sessions");
  const db = await serverClient();
  const { error } = await db.rpc("pay_with_credit", { p_booking: id });
  if (error) redirect(`/checkout/${id}/pay?error=${encodeURIComponent(friendly(error.message))}`);
  redirect(`/bookings/${id}/confirmed`);
}
