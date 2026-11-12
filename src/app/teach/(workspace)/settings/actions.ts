"use server";
import { redirect } from "next/navigation";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { encryptField, canEncrypt } from "@/lib/crypto";
import { friendly } from "@/lib/db-error";
import { sendTestPayout } from "@/lib/payouts";
import { normaliseKenyanPhone } from "@/domain/format";
import { normaliseKraPin } from "@/domain/payouts";

/** T28: KRA PIN and payout number, encrypted before they reach the database. */

export type SState = { error?: string };

export async function saveKraPin(_: SState, form: FormData): Promise<SState> {
  if (!hasSupabase) return { error: "Not connected to the database." };
  if (!canEncrypt()) return { error: "Saving tax details is not switched on in this environment yet." };
  const pin = normaliseKraPin(String(form.get("kra_pin") ?? ""));
  if (!pin) return { error: "A KRA PIN is a letter, nine digits and a letter, like A012345678Z." };
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { error: "Sign in again." };
  const { data, error } = await db.from("teachers").update({ kra_pin_enc: encryptField(pin) }).eq("user_id", auth.user.id).select("id");
  if (error) return { error: friendly(error.message) };
  if (!data?.length) return { error: "Apply as a teacher first." };
  redirect("/teach/settings?done=kra");
}

export async function savePayoutNumber(_: SState, form: FormData): Promise<SState> {
  if (!hasSupabase) return { error: "Not connected to the database." };
  if (!canEncrypt()) return { error: "Saving payout details is not switched on in this environment yet." };
  const phone = normaliseKenyanPhone(String(form.get("phone") ?? ""));
  if (!phone) return { error: "Enter a Safaricom number, like 0712 345 678." };
  const db = await serverClient();
  const { data: checkId, error } = await db.rpc("set_payout_number", { p_phone_enc: encryptField(phone) });
  if (error) return { error: friendly(error.message) };
  const { data: teacherId } = await db.rpc("my_teacher_id");
  const sent = await sendTestPayout(String(checkId), String(teacherId));
  redirect(sent.ok ? "/teach/verification/payout-number?done=sent" : `/teach/settings?done=phone&note=${encodeURIComponent(sent.error)}`);
}
