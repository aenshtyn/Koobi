"use server";
import { redirect } from "next/navigation";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { friendly } from "@/lib/db-error";
import { uploadDocument } from "@/lib/documents";
import { canEncrypt, encryptField } from "@/lib/crypto";
import { sendTestPayout } from "@/lib/payouts";
import { DOC_KINDS } from "@/domain/payouts";
import { CHECKS, detailsFrom } from "./config";

/** Teacher side of verification (T2–T8). Every rule is checked again in the database. */

export type VState = { error?: string };

function back(path: string, done: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}done=${done}`);
}

async function startCheck(type: string, offering: string | null) {
  const db = await serverClient();
  const { data, error } = await db.rpc("start_check", { p_type: type, p_offering: offering });
  return { db, id: (data as string | null) ?? null, error };
}

export async function uploadForCheck(_: VState, form: FormData): Promise<VState> {
  if (!hasSupabase) return { error: "Not connected to the database." };
  const type = String(form.get("type") ?? "");
  const kind = String(form.get("kind") ?? "");
  const path = String(form.get("path") ?? "/teach/verification");
  const offering = (String(form.get("offering_id") ?? "") || null) as string | null;
  const config = CHECKS[type];
  if (!config || !config.kinds.includes(kind) || !(kind in DOC_KINDS)) return { error: "Choose what the file is." };
  const { db, id, error } = await startCheck(type, offering);
  if (error || !id) return { error: friendly(error?.message) };
  const { data: teacherId } = await db.rpc("my_teacher_id");
  const up = await uploadDocument({ file: form.get("file") as File, teacherId: String(teacherId), checkId: id, kind });
  if (!up.ok) return { error: up.error };
  back(path, "uploaded");
}

export async function submitForCheck(_: VState, form: FormData): Promise<VState> {
  if (!hasSupabase) return { error: "Not connected to the database." };
  const type = String(form.get("type") ?? "");
  const path = String(form.get("path") ?? "/teach/verification");
  const offering = (String(form.get("offering_id") ?? "") || null) as string | null;
  const config = CHECKS[type];
  if (!config) return { error: "Unknown check." };
  const details = detailsFrom(config, form);
  for (const f of config.fields) if (f.required && !details[f.name]) return { error: `Fill in: ${f.label}.` };
  if (type === "identity_iprs") {
    // The ID number is stored encrypted; reviewers see it decrypted on the review screen only.
    const digits = String(details.id_number ?? "").replace(/\s/g, "");
    if (!/^[0-9]{6,9}$/.test(digits)) return { error: "Enter your ID number as it appears on the card." };
    if (!canEncrypt()) return { error: "ID checks are not switched on in this environment yet." };
    details.id_number_enc = encryptField(digits);
    delete details.id_number;
  }
  if (config.people && (details.references as unknown[]).length < config.people.count) return { error: `Add ${config.people.count} references in full.` };
  const { db, id, error } = await startCheck(type, offering);
  if (error || !id) return { error: friendly(error?.message) };
  const { error: sErr } = await db.rpc("submit_check", { p_check: id, p_details: details });
  if (sErr) return { error: friendly(sErr.message) };
  back(path, "sent");
}

export async function requestTestPayout(_: VState, form: FormData): Promise<VState> {
  void form;
  if (!hasSupabase) return { error: "Not connected to the database." };
  const db = await serverClient();
  const { data: teacherId } = await db.rpc("my_teacher_id");
  const { data: check } = await db
    .from("my_verification_checks")
    .select("id, status")
    .eq("teacher_id", String(teacherId))
    .eq("check_type", "payout_ownership")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!check || check.status !== "pending") return { error: "Save your payout number in Settings first." };
  const sent = await sendTestPayout(check.id, String(teacherId));
  if (!sent.ok) return { error: sent.error };
  back("/teach/verification/payout-number", "sent");
}
