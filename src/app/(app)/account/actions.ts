"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { friendly } from "@/lib/db-error";
import { canEncrypt, encryptField } from "@/lib/crypto";
import { uploadGuardianDocument } from "@/lib/documents";

/** Parent account, children and consent (L19–L21), settings and data requests (L26). */

export type AState = { error?: string };
const CONSENT_VERSION = "parental-consent-2026-11-v1";

export async function addChild(_: AState, form: FormData): Promise<AState> {
  if (!hasSupabase) return { error: "Not connected to the database." };
  if (form.get("consent") !== "yes") return { error: "Tick the consent to continue. No child details are saved without it." };
  const alias = String(form.get("alias") ?? "").trim();
  const year = Number(form.get("year_of_birth"));
  const db = await serverClient();
  const { error: gErr } = await db.rpc("become_guardian", { p_display_name: String(form.get("parent_name") ?? "") });
  if (gErr) return { error: friendly(gErr.message) };
  const { error } = await db.rpc("add_child", {
    p_alias: alias,
    p_year_of_birth: Number.isInteger(year) ? year : null,
    p_curriculum: String(form.get("curriculum") ?? ""),
    p_level: String(form.get("level") ?? ""),
    p_language: String(form.get("language") ?? ""),
    p_needs: [],
    p_consent_version: CONSENT_VERSION,
  });
  if (error) return { error: friendly(error.message) };
  redirect("/account/learners?done=added");
}

export async function withdrawConsent(form: FormData) {
  const db = await serverClient();
  const { error } = await db.rpc("withdraw_consent", { p_learner: String(form.get("learner_id") ?? "") });
  redirect(error ? `/account/learners?error=${encodeURIComponent(friendly(error.message))}` : "/account/learners?done=withdrawn");
}

export async function uploadIdDocument(_: AState, form: FormData): Promise<AState> {
  if (!hasSupabase) return { error: "Not connected to the database." };
  const db = await serverClient();
  await db.rpc("become_guardian", { p_display_name: "" });
  const { data: checkId, error } = await db.rpc("start_guardian_check");
  if (error || !checkId) return { error: friendly(error?.message) };
  const kind = String(form.get("kind") ?? "");
  if (!["id_front", "id_back", "passport", "selfie"].includes(kind)) return { error: "Choose what the photo is." };
  const up = await uploadGuardianDocument({ file: form.get("file") as File, checkId: String(checkId), kind });
  if (!up.ok) return { error: up.error };
  redirect("/account/identity?done=uploaded");
}

export async function submitIdCheck(_: AState, form: FormData): Promise<AState> {
  if (!hasSupabase) return { error: "Not connected to the database." };
  if (!canEncrypt()) return { error: "ID checks are not switched on in this environment yet." };
  const idNumber = String(form.get("id_number") ?? "").replace(/\s/g, "");
  if (!/^[0-9A-Z]{6,12}$/i.test(idNumber)) return { error: "Enter the ID or passport number as printed." };
  const db = await serverClient();
  const { data: checkId, error } = await db.rpc("start_guardian_check");
  if (error || !checkId) return { error: friendly(error?.message) };
  const { error: sErr } = await db.rpc("submit_guardian_check", { p_check: checkId, p_id_number_enc: encryptField(idNumber.toUpperCase()) });
  if (sErr) return { error: friendly(sErr.message) };
  redirect("/account/identity?done=sent");
}

export async function saveProfile(_: AState, form: FormData): Promise<AState> {
  const name = String(form.get("display_name") ?? "").trim();
  if (name.length < 2 || name.length > 80) return { error: "Enter your name (2 to 80 letters)." };
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { error: "Sign in again." };
  const locale = form.get("locale") === "sw" ? "sw" : "en";
  const { error } = await db.from("profiles").update({ display_name: name, locale }).eq("id", auth.user.id);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/account/settings");
  redirect("/account/settings?done=profile");
}

export async function savePrefs(_: AState, form: FormData): Promise<AState> {
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { error: "Sign in again." };
  const wa = form.get("whatsapp_opt_in") === "on";
  const row = {
    user_id: auth.user.id,
    whatsapp_opt_in: wa,
    whatsapp_opt_in_at: wa ? new Date().toISOString() : null,
    sms_enabled: form.get("sms_enabled") === "on",
    email_enabled: form.get("email_enabled") === "on",
    marketing_opt_in: form.get("marketing_opt_in") === "on",
  };
  const { error } = await db.from("notification_preferences").upsert(row, { onConflict: "user_id" });
  if (error) return { error: friendly(error.message) };
  redirect("/account/settings?done=prefs");
}

export async function requestData(form: FormData) {
  const kind = form.get("kind") === "erasure" ? "erasure" : "export";
  const db = await serverClient();
  const { error } = await db.from("data_requests").insert({ kind, note: String(form.get("note") ?? "").slice(0, 500) || null });
  redirect(error ? `/account/settings?error=${encodeURIComponent(friendly(error.message))}` : `/account/settings?done=${kind}`);
}
