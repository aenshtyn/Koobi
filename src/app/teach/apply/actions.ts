"use server";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TERMS_VERSION, applicationEditable, blockedByEmployment, parseLinks, parseStep1, parseStep2, parseStep3, type ApplicationStatus } from "@/domain/expert";
import { CATEGORY_TRACKS } from "@/domain/listing-input";
import type { CategoryCode } from "@/domain/taxonomy";
import { getSessionUser } from "@/lib/auth";
import { friendly } from "@/lib/db-error";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { isOwnPhoto, photoUrl, removeUploads, signUpload, verifyUpload, type UploadKind, type UploadTarget } from "@/lib/expert-uploads";

export type StepState = { errors?: Record<string, string>; error?: string };
type Mine = { id: string; application_status: ApplicationStatus; application_step: number; photo_url: string | null };

const NOT_CONNECTED = "Saving needs the database. Add the Supabase keys to .env.local.";

/** The signed-in person's expert row, created on first use so files and steps have somewhere to go. */
async function mine(db: SupabaseClient, create: boolean): Promise<Mine | null> {
  const user = await getSessionUser();
  if (!user || user.dev) redirect("/signin?next=/teach/apply");
  const cols = "id, application_status, application_step, photo_url";
  const { data } = await db.from("teachers").select(cols).eq("user_id", user.id).maybeSingle();
  if (data || !create) return (data as Mine | null) ?? null;
  const { data: made, error } = await db.from("teachers").insert({ display_name: (user.name ?? "").trim().slice(0, 80) || "New expert" }).select(cols).single();
  if (error) throw new Error(`teachers: ${error.message}`);
  await db.rpc("claim_role", { p_role: "teacher" });
  return made as Mine;
}

// ---------------------------------------------------------------------------
// Uploads (browser straight to storage; see src/lib/expert-uploads.ts)

/** Step one of an upload: a one-time link for one file under the expert's own folder. */
export async function startUpload(kind: UploadKind, mime: string, size: number): Promise<{ target?: UploadTarget; error?: string }> {
  if (!hasSupabase) return { error: NOT_CONNECTED };
  const db = await serverClient();
  const me = await mine(db, true);
  if (!me) return { error: "Start your application first." };
  if (kind === "video" && me.application_status !== "approved") return { error: "The introduction video is uploaded after your application is approved." };
  const r = await signUpload(kind, me.id, mime, size);
  return r.ok ? { target: r.target } : { error: r.error };
}

/**
 * The photo arrived. During the application it is saved on the row; once approved it becomes a
 * draft change that a reviewer approves before learners see it.
 */
export async function savePhoto(path: string): Promise<{ url?: string; pending?: boolean; error?: string }> {
  if (!hasSupabase) return { error: NOT_CONNECTED };
  const db = await serverClient();
  const me = await mine(db, false);
  if (!me) return { error: "Start your application first." };
  const seen = await verifyUpload("photo", me.id, path);
  if (!seen.ok) return { error: seen.error };
  const url = photoUrl(path);
  if (me.application_status === "approved") {
    const { error } = await db.rpc("propose_profile_change", { p_changes: { photo_url: url } });
    if (error) return { error: friendly(error.message) };
    return { url, pending: true };
  }
  if (!applicationEditable(me.application_status)) {
    await removeUploads("photo", [path]);
    return { error: "Your application is with Koobi and cannot change right now." };
  }
  const { error } = await db.from("teachers").update({ photo_url: url }).eq("id", me.id);
  if (error) return { error: friendly(error.message) };
  return { url };
}

/** A document arrived: the ID or passport, or one qualification. Each becomes its own row to verify. */
export async function saveDocument(input: { kind: string; title: string; issuer?: string; path: string; fileName: string }): Promise<{ error?: string }> {
  if (!hasSupabase) return { error: NOT_CONNECTED };
  const db = await serverClient();
  const me = await mine(db, false);
  if (!me) return { error: "Start your application first." };
  const seen = await verifyUpload("document", me.id, input.path);
  if (!seen.ok) return { error: seen.error };
  const { error } = await db.rpc("add_credential", {
    p_kind: input.kind,
    p_title: input.title,
    p_issuer: input.issuer ?? null,
    p_storage_key: input.path,
    p_file_name: input.fileName.replace(/[\\/\u0000-\u001f]/g, " ").trim().slice(0, 120),
  });
  if (error) {
    await removeUploads("document", [input.path]);
    return { error: friendly(error.message) };
  }
  return {};
}

export async function removeDocument(id: string): Promise<{ error?: string }> {
  if (!hasSupabase) return { error: NOT_CONNECTED };
  const db = await serverClient();
  const { data: key, error } = await db.rpc("remove_credential", { p_credential: id });
  if (error) return { error: friendly(error.message) };
  if (typeof key === "string") await removeUploads("document", [key]);
  return {};
}

// ---------------------------------------------------------------------------
// The five steps

/** Saves one step and moves to the next. Progress is kept on the row, so the applicant can leave and return. */
export async function saveStep(_: StepState, form: FormData): Promise<StepState> {
  if (!hasSupabase) return { error: NOT_CONNECTED };
  const step = Number(form.get("step"));
  const db = await serverClient();
  const me = await mine(db, true);
  if (!me) return { error: "Sign in to continue." };
  if (!applicationEditable(me.application_status)) redirect("/teach/apply/status");

  let patch: Record<string, unknown>;
  if (step === 1) {
    const p = parseStep1(form);
    if (!me.photo_url || !isOwnPhoto(me.photo_url, me.id)) p.errors.photo = "Upload a clear, professional photograph of yourself.";
    if (Object.keys(p.errors).length) return { errors: p.errors };
    patch = p.values;
  } else if (step === 2) {
    const p = parseStep2(form);
    if (Object.keys(p.errors).length) return { errors: p.errors };
    patch = p.values;
  } else if (step === 3) {
    const p = parseStep3(form);
    if (Object.keys(p.errors).length) return { errors: p.errors };
    patch = p.values;
  } else if (step === 4) {
    const p = parseLinks(form);
    if (Object.keys(p.errors).length) return { errors: p.errors };
    const { count } = await db.from("teacher_credentials").select("id", { count: "exact", head: true }).eq("teacher_id", me.id).eq("kind", "identity").is("deleted_at", null).neq("status", "rejected");
    if (!count) return { errors: { identity: "Upload a clear copy of your national ID or passport." } };
    patch = p.values;
  } else {
    return { error: "That step was not recognised." };
  }

  const { error } = await db
    .from("teachers")
    .update({ ...patch, application_step: Math.max(me.application_step, Math.min(step + 1, 5)) })
    .eq("id", me.id);
  if (error) return { error: `We could not save this step: ${friendly(error.message)}` };

  if (step === 3 && typeof patch.primary_category === "string") {
    // The internal track behind the category, so learning experiences can be created after approval.
    const track = CATEGORY_TRACKS[patch.primary_category as CategoryCode]?.[0];
    if (track) await db.from("teacher_tracks").upsert({ teacher_id: me.id, track }, { onConflict: "teacher_id,track", ignoreDuplicates: true });
  }
  redirect(`/teach/apply?step=${step + 1}`);
}

export async function submitApplication(_: StepState, form: FormData): Promise<StepState> {
  if (!hasSupabase) return { error: NOT_CONNECTED };
  if (form.get("agree") !== "on") return { errors: { agree: "Tick the box to confirm before you submit." } };
  const db = await serverClient();
  const me = await mine(db, false);
  if (!me) redirect("/teach/apply");
  const { data: row } = await db.from("teachers").select("employment_status").eq("id", me.id).maybeSingle();
  if (blockedByEmployment((row?.employment_status as string | null) ?? null)) {
    return { error: "Teachers employed full time by TSC cannot take other paid work under the TSC Code of Conduct, so we cannot accept this application." };
  }
  const { error } = await db.rpc("submit_application", { p_terms_version: TERMS_VERSION });
  if (error) return { error: friendly(error.message) };
  updateTag("teachers");
  redirect("/teach/apply/status?sent=1");
}
