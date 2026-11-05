"use server";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CATEGORY_TRACKS,
  EMPLOYMENT_DECLARATION_VERSION,
  PRICE_BANDS,
  blocksSubmission,
  parseOfferForm,
  parseTeacherForm,
  parseWindow,
} from "@/domain/listing-input";
import type { ListingState } from "@/domain/listing";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { getCounties, getMyTeacher, getPriceBands } from "@/lib/data/listings";

export type ActionState = { errors?: Record<string, string>; error?: string; values?: Record<string, string | string[]> };

const NOT_CONNECTED: ActionState = { error: "Saving needs the database. Add the Supabase keys to .env.local." };

/** Echo the submitted fields so the form re-renders with them after a validation error. */
function echo(form: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const k of new Set(form.keys())) {
    const vals = form.getAll(k).map(String);
    out[k] = vals.length > 1 || ["languages", "categories", "modes", "language_codes"].includes(k) ? vals : vals[0];
  }
  return out;
}

function refreshCatalogue() {
  updateTag("offers");
  updateTag("teachers");
}

/**
 * Moves a listing to `pending_review` from wherever it stands, following the transition table:
 * rejected → draft → pending_review; approved → draft → pending_review (a public field changed).
 */
async function submitForReview(db: SupabaseClient, table: "teachers" | "offerings", id: string, current: ListingState) {
  if (current === "pending_review") return null;
  if (current === "rejected" || current === "approved") {
    const { error } = await db.from(table).update({ listing_status: "draft", rejection_reason: null }).eq("id", id);
    if (error) return error.message;
  }
  const { error } = await db.from(table).update({ listing_status: "pending_review" }).eq("id", id);
  return error?.message ?? null;
}

// ---------------------------------------------------------------------------
// Application (teacher profile)

export async function saveApplication(_: ActionState, form: FormData): Promise<ActionState> {
  if (!hasSupabase) return NOT_CONNECTED;
  const counties = (await getCounties()).map((c) => c.code);
  const parsed = parseTeacherForm(form, counties);
  if (!parsed.values) return { errors: parsed.errors, values: echo(form) };
  const v = parsed.values;
  const submit = form.get("intent") === "submit";
  if (submit && blocksSubmission(v.employment_status)) {
    return {
      error: "Teachers employed full time by TSC cannot take other paid work under the TSC Code of Conduct, so we cannot list your profile.",
      values: echo(form),
    };
  }

  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/signin?next=/teach/apply");

  const row = {
    display_name: v.display_name,
    headline: v.headline,
    bio: v.bio,
    teacher_type: v.teacher_type,
    employment_status: v.employment_status,
    employment_declaration_version: EMPLOYMENT_DECLARATION_VERSION,
    employment_declared_at: new Date().toISOString(),
    county_code: v.county_code,
    languages: v.languages,
  };

  const existing = await getMyTeacher();
  let teacherId = existing?.id;
  if (existing) {
    const { error } = await db.from("teachers").update(row).eq("id", existing.id);
    if (error) return { error: `We could not save your profile: ${error.message}`, values: echo(form) };
  } else {
    const { data, error } = await db.from("teachers").insert(row).select("id").single();
    if (error) return { error: `We could not create your profile: ${error.message}`, values: echo(form) };
    teacherId = data.id as string;
  }

  const tracks = [...new Set(v.categories.map((c) => CATEGORY_TRACKS[c][0]))].filter((t) => !existing?.tracks.includes(t));
  if (tracks.length) {
    const { error } = await db.from("teacher_tracks").insert(tracks.map((track) => ({ teacher_id: teacherId, track })));
    if (error) return { error: `We could not save your categories: ${error.message}`, values: echo(form) };
  }
  await db.rpc("claim_role", { p_role: "teacher" });

  // A live profile that changes goes back to review; so does an explicit submit.
  const state = existing?.listing_status ?? "draft";
  if (submit || state === "approved") {
    const err = await submitForReview(db, "teachers", teacherId!, state);
    if (err) return { error: `Saved, but we could not send it for review: ${err}`, values: echo(form) };
  }
  refreshCatalogue();
  redirect(`/teach/profile?saved=${submit || state === "approved" ? "submitted" : "draft"}`);
}

// ---------------------------------------------------------------------------
// Offers

export async function saveOffer(_: ActionState, form: FormData): Promise<ActionState> {
  if (!hasSupabase) return NOT_CONNECTED;
  const teacher = await getMyTeacher();
  if (!teacher) redirect("/teach/apply");
  const parsed = parseOfferForm(form, { ...PRICE_BANDS, ...(await getPriceBands()) });
  if (!parsed.values) return { errors: parsed.errors, values: echo(form) };
  const v = parsed.values;
  const id = String(form.get("id") ?? "");
  const submit = form.get("intent") === "submit";
  const db = await serverClient();

  if (!teacher.tracks.includes(v.track)) {
    const { error } = await db.from("teacher_tracks").insert({ teacher_id: teacher.id, track: v.track });
    if (error) return { error: `We could not add this kind of offer to your profile: ${error.message}`, values: echo(form) };
  }

  const row = {
    title: v.title,
    summary: v.summary,
    description: v.description,
    outcomes: v.outcomes,
    category: v.category,
    track: v.track,
    subject_text: v.subject_text,
    curriculum_code: v.curriculum_code,
    goal: v.goal,
    modes: v.modes,
    meeting_tool: v.meeting_tool,
    duration_minutes: v.duration_minutes,
    price_hour_kes: v.price_hour_kes,
    trial_discount_pct: v.trial_discount_pct,
    language_codes: v.language_codes,
  };

  let offerId = id;
  let state: ListingState = "draft";
  if (id) {
    const { data: current, error: readErr } = await db.from("offerings").select("listing_status").eq("id", id).maybeSingle();
    if (readErr || !current) return { error: "That offer was not found.", values: echo(form) };
    state = current.listing_status as ListingState;
    const { error } = await db.from("offerings").update(row).eq("id", id);
    if (error) return { error: `We could not save the offer: ${error.message}`, values: echo(form) };
  } else {
    const { data, error } = await db
      .from("offerings")
      .insert({ ...row, teacher_id: teacher.id, format: "one_to_one" })
      .select("id")
      .single();
    if (error) return { error: `We could not create the offer: ${error.message}`, values: echo(form) };
    offerId = data.id as string;
  }

  let outcome = "draft";
  if (submit || state === "approved") {
    if (submit && blocksSubmission(teacher.employment_status)) {
      return { error: "Saved as a draft. Full-time TSC teachers cannot list offers.", values: echo(form) };
    }
    const err = await submitForReview(db, "offerings", offerId, state);
    if (err) return { error: `Saved, but we could not send it for review: ${err}`, values: echo(form) };
    outcome = "submitted";
  } else if (state === "rejected") {
    await db.from("offerings").update({ listing_status: "draft", rejection_reason: null }).eq("id", offerId);
  }
  refreshCatalogue();
  redirect(`/teach/offers/${offerId}?saved=${outcome}`);
}

export async function submitOffer(form: FormData) {
  if (!hasSupabase) return;
  const id = String(form.get("id") ?? "");
  const teacher = await getMyTeacher();
  if (!teacher || blocksSubmission(teacher.employment_status)) redirect(`/teach/offers/${id}`);
  const db = await serverClient();
  const { data } = await db.from("offerings").select("listing_status").eq("id", id).maybeSingle();
  if (data) await submitForReview(db, "offerings", id, data.listing_status as ListingState);
  refreshCatalogue();
  redirect(`/teach/offers/${id}?saved=submitted`);
}

export async function setOfferPaused(form: FormData) {
  if (!hasSupabase) return;
  const id = String(form.get("id") ?? "");
  const to = form.get("to") === "paused" ? "paused" : "approved";
  const db = await serverClient();
  await db.from("offerings").update({ listing_status: to }).eq("id", id);
  refreshCatalogue();
  redirect(`/teach/offers/${id}`);
}

export async function deleteOffer(form: FormData) {
  if (!hasSupabase) return;
  const id = String(form.get("id") ?? "");
  const db = await serverClient();
  await db.from("offerings").delete().eq("id", id).eq("listing_status", "draft");
  redirect("/teach/offers?deleted=1");
}

// ---------------------------------------------------------------------------
// Weekly availability (per offer, Nairobi time)

export async function addWindow(_: ActionState, form: FormData): Promise<ActionState> {
  if (!hasSupabase) return NOT_CONNECTED;
  const offeringId = String(form.get("offering_id") ?? "");
  const parsed = parseWindow(form);
  if (!parsed.values) return { errors: parsed.errors };
  const db = await serverClient();
  const { error } = await db.from("availability_windows").insert({ offering_id: offeringId, kind: "weekly", ...parsed.values });
  if (error) return { error: `We could not add that time: ${error.message}` };
  updateTag("offers");
  return {};
}

export async function removeWindow(form: FormData) {
  if (!hasSupabase) return;
  const db = await serverClient();
  await db.from("availability_windows").delete().eq("id", String(form.get("id") ?? ""));
  updateTag("offers");
  redirect("/teach/availability");
}
