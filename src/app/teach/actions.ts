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
} from "@/domain/listing-input";
import type { ListingState } from "@/domain/listing";
import { dayKey, parseSchedule } from "@/domain/schedule";
import { hasSupabase } from "@/lib/supabase/config";
import { friendly } from "@/lib/db-error";
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
  const id = String(form.get("id") ?? "");
  const submit = form.get("intent") === "submit";
  const db = await serverClient();
  // A published or in-review experience goes back for review on every save, so it must be complete.
  // A draft can be saved half-finished.
  let state: ListingState = "draft";
  if (id) {
    const { data: current, error: readErr } = await db.from("offerings").select("listing_status, format").eq("id", id).maybeSingle();
    if (readErr || !current) return { error: "That learning experience was not found.", values: echo(form) };
    state = current.listing_status as ListingState;
    form.set("format", current.format as string); // the format is fixed once created
  }
  const complete = submit || (state !== "draft" && state !== "rejected");
  const parsed = parseOfferForm(form, { ...PRICE_BANDS, ...(await getPriceBands()) }, complete ? "submit" : "draft");
  if (!parsed.values) return { errors: parsed.errors, values: echo(form) };
  const v = parsed.values;

  if (!teacher.tracks.includes(v.track)) {
    const { error } = await db.from("teacher_tracks").insert({ teacher_id: teacher.id, track: v.track });
    if (error) return { error: `We could not add this kind of learning experience to your profile: ${error.message}`, values: echo(form) };
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
    price_seat_kes: v.price_seat_kes,
    capacity_min: v.capacity_min,
    capacity_max: v.capacity_max,
    sessions_in_run: v.sessions_in_run,
    price_pkg8_kes: v.price_pkg8_kes,
    price_pkg12_kes: v.price_pkg12_kes,
    price_pkg16_kes: v.price_pkg16_kes,
    trial_discount_pct: v.price_hour_kes ? v.trial_discount_pct : null,
    language_codes: v.language_codes,
  };

  let offerId = id;
  if (id) {
    const { error } = await db.from("offerings").update(row).eq("id", id);
    if (error) return { error: `We could not save the learning experience: ${error.message}`, values: echo(form) };
  } else {
    const { data, error } = await db
      .from("offerings")
      .insert({ ...row, teacher_id: teacher.id, format: v.format })
      .select("id")
      .single();
    if (error) return { error: `We could not create the learning experience: ${friendly(error.message)}`, values: echo(form) };
    offerId = data.id as string;
    if (v.format === "one_to_one") await copyScheduleTo(db, teacher.id, offerId);
  }

  // The expert's own packages are saved as a set. A database without the table yet only matters when there are some.
  const { error: clearErr } = await db.from("offering_packages").delete().eq("offering_id", offerId);
  if (v.packages.length) {
    const { error: pkgErr } = clearErr
      ? { error: clearErr }
      : await db.from("offering_packages").insert(v.packages.map((p, i) => ({ offering_id: offerId, name: p.name, description: p.description, sessions: p.sessions, price_kes: p.price_kes, validity_weeks: p.validity_weeks, position: i + 1 })));
    if (pkgErr) return { error: `Saved, but your packages could not be saved: ${friendly(pkgErr.message)}`, values: { ...echo(form), id: offerId } };
  }

  let outcome = "draft";
  if (submit || state === "approved") {
    if (submit && blocksSubmission(teacher.employment_status)) {
      return { error: "Saved as a draft. Full-time TSC teachers cannot list learning experiences.", values: echo(form) };
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
  const { error } = await db.from("offerings").update({ listing_status: to }).eq("id", id);
  refreshCatalogue();
  if (form.get("back") === "list") redirect(`/teach/offers?done=${error ? "error" : to === "paused" ? "paused" : "resumed"}`);
  redirect(`/teach/offers/${id}`);
}

/** A draft copy of one of the expert's own learning experiences, opened in the editor (availability is not copied). */
export async function duplicateOffer(form: FormData) {
  if (!hasSupabase) return;
  const id = String(form.get("id") ?? "");
  const teacher = await getMyTeacher();
  if (!teacher) redirect("/teach/apply");
  const db = await serverClient();
  const { data: o } = await db
    .from("offerings")
    .select("title, summary, description, outcomes, category, track, format, subject_text, curriculum_code, goal, modes, meeting_tool, duration_minutes, price_hour_kes, price_seat_kes, capacity_min, capacity_max, sessions_in_run, price_pkg8_kes, price_pkg12_kes, price_pkg16_kes, trial_discount_pct, language_codes")
    .eq("id", id)
    .eq("teacher_id", teacher.id)
    .maybeSingle();
  if (!o) redirect("/teach/offers?done=error");
  const { data, error } = await db
    .from("offerings")
    .insert({ ...o, title: `${o.title} (copy)`.slice(0, 120), teacher_id: teacher.id })
    .select("id")
    .single();
  if (error || !data) redirect("/teach/offers?done=error");
  if (o.format === "one_to_one") await copyScheduleTo(db, teacher.id, data.id as string);
  const { data: own } = await db.from("offering_packages").select("name, description, sessions, price_kes, validity_weeks, position").eq("offering_id", id);
  if (own?.length) await db.from("offering_packages").insert(own.map((p) => ({ ...p, offering_id: data.id })));
  redirect(`/teach/offers/${data.id}?saved=copied`);
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

/** Experiences that carry the expert's schedule: every one-to-one that is not retired. */
async function scheduleOfferIds(db: SupabaseClient, teacherId: string): Promise<string[]> {
  const { data } = await db.from("offerings").select("id").eq("teacher_id", teacherId).eq("format", "one_to_one").neq("listing_status", "retired");
  return ((data ?? []) as { id: string }[]).map((o) => o.id);
}

/** A new experience starts with the expert's existing schedule and blocked dates. */
async function copyScheduleTo(db: SupabaseClient, teacherId: string, newId: string) {
  const others = (await scheduleOfferIds(db, teacherId)).filter((id) => id !== newId);
  if (!others.length) return;
  const { data } = await db.from("availability_windows").select("kind, weekday, starts, ends, exception_date").in("offering_id", others);
  const seen = new Set<string>();
  const rows = ((data ?? []) as { kind: string; weekday: number | null; starts: string | null; ends: string | null; exception_date: string | null }[]).filter((r) => {
    const k = `${r.kind}|${r.weekday}|${r.starts}|${r.ends}|${r.exception_date}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
  if (rows.length) await db.from("availability_windows").insert(rows.map((r) => ({ ...r, offering_id: newId })));
}

export type ScheduleState = { error?: string; saved?: boolean };

/**
 * Saves the whole week for every one-to-one experience. New rows go in before the old ones come out,
 * so a failed save never leaves the expert with no hours. Confirmed bookings are not touched.
 */
export async function saveWeeklySchedule(_: ScheduleState, form: FormData): Promise<ScheduleState> {
  if (!hasSupabase) return { error: NOT_CONNECTED.error };
  const teacher = await getMyTeacher();
  if (!teacher) redirect("/teach/apply");
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("schedule") ?? "[]"));
  } catch {
    return { error: "The schedule could not be read. Try again." };
  }
  const parsed = parseSchedule(raw);
  if ("error" in parsed) return { error: parsed.error };
  const db = await serverClient();
  const ids = await scheduleOfferIds(db, teacher.id);
  if (!ids.length) return { error: "Create a one-to-one learning experience first; your hours are saved with it." };
  const { data: old } = await db.from("availability_windows").select("id").in("offering_id", ids).eq("kind", "weekly");
  if (parsed.values.length) {
    const { error } = await db.from("availability_windows").insert(ids.flatMap((offering_id) => parsed.values.map((r) => ({ offering_id, kind: "weekly", ...r }))));
    if (error) return { error: `We could not save your hours: ${error.message}` };
  }
  const oldIds = ((old ?? []) as { id: string }[]).map((r) => r.id);
  if (oldIds.length) {
    const { error } = await db.from("availability_windows").delete().in("id", oldIds);
    if (error) return { error: `Your new hours were added, but the old ones could not be removed: ${error.message}` };
  }
  updateTag("offers");
  redirect("/teach/availability?done=saved");
}

export async function blockDate(_: ScheduleState, form: FormData): Promise<ScheduleState> {
  if (!hasSupabase) return { error: NOT_CONNECTED.error };
  const teacher = await getMyTeacher();
  if (!teacher) redirect("/teach/apply");
  const date = String(form.get("date") ?? "");
  const whole = form.get("whole") === "on";
  const starts = String(form.get("starts") ?? "");
  const ends = String(form.get("ends") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choose a date." };
  if (date < dayKey(new Date())) return { error: "Choose today or a later date." };
  if (!whole && (!/^\d{2}:\d{2}$/.test(starts) || !/^\d{2}:\d{2}$/.test(ends) || starts >= ends)) return { error: "Choose the hours to block, with the end after the start." };
  const db = await serverClient();
  const ids = await scheduleOfferIds(db, teacher.id);
  if (!ids.length) return { error: "Create a one-to-one learning experience first." };
  const { error } = await db
    .from("availability_windows")
    .insert(ids.map((offering_id) => ({ offering_id, kind: "blocked", exception_date: date, starts: whole ? null : starts, ends: whole ? null : ends })));
  if (error) return { error: `We could not block that date: ${error.message}` };
  updateTag("offers");
  redirect("/teach/availability?done=blocked");
}

export async function unblockDate(form: FormData) {
  if (!hasSupabase) return;
  const teacher = await getMyTeacher();
  if (!teacher) redirect("/teach/apply");
  const date = String(form.get("date") ?? "");
  const starts = String(form.get("starts") ?? "");
  const db = await serverClient();
  const ids = await scheduleOfferIds(db, teacher.id);
  if (ids.length && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    let q = db.from("availability_windows").delete().in("offering_id", ids).eq("kind", "blocked").eq("exception_date", date);
    q = starts ? q.eq("starts", starts) : q.is("starts", null);
    await q;
  }
  updateTag("offers");
  redirect("/teach/availability?done=unblocked");
}

/** Extra hours on one date, on top of the weekly hours. */
export async function addExtraHours(_: ScheduleState, form: FormData): Promise<ScheduleState> {
  if (!hasSupabase) return { error: NOT_CONNECTED.error };
  const teacher = await getMyTeacher();
  if (!teacher) redirect("/teach/apply");
  const date = String(form.get("date") ?? "");
  const starts = String(form.get("starts") ?? "");
  const ends = String(form.get("ends") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choose a date." };
  if (date < dayKey(new Date())) return { error: "Choose today or a later date." };
  if (!/^\d{2}:\d{2}$/.test(starts) || !/^\d{2}:\d{2}$/.test(ends) || starts >= ends) return { error: "Choose the extra hours, with the end after the start." };
  const db = await serverClient();
  const ids = await scheduleOfferIds(db, teacher.id);
  if (!ids.length) return { error: "Create a one-to-one learning experience first." };
  const { error } = await db.from("availability_windows").insert(ids.map((offering_id) => ({ offering_id, kind: "extra", exception_date: date, starts, ends })));
  if (error) return { error: `We could not add those hours: ${error.message}` };
  updateTag("offers");
  redirect("/teach/availability?done=extra");
}

export async function removeExtraHours(form: FormData) {
  if (!hasSupabase) return;
  const teacher = await getMyTeacher();
  if (!teacher) redirect("/teach/apply");
  const date = String(form.get("date") ?? "");
  const starts = String(form.get("starts") ?? "");
  const db = await serverClient();
  const ids = await scheduleOfferIds(db, teacher.id);
  if (ids.length && /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}/.test(starts)) {
    await db.from("availability_windows").delete().in("offering_id", ids).eq("kind", "extra").eq("exception_date", date).eq("starts", starts);
  }
  updateTag("offers");
  redirect("/teach/availability?done=extra_removed");
}

/** The expert's own booking rules: shortest notice, how far ahead, and the gap between lessons. */
export async function saveBookingPrefs(_: ScheduleState, form: FormData): Promise<ScheduleState> {
  if (!hasSupabase) return { error: NOT_CONNECTED.error };
  const n = (k: string) => Number(form.get(k));
  const db = await serverClient();
  const { error } = await db.rpc("set_booking_preferences", { p_notice_hours: n("min_notice_hours"), p_advance_days: n("advance_days"), p_buffer_minutes: n("buffer_minutes") });
  if (error) return { error: friendly(error.message) };
  updateTag("offers");
  redirect("/teach/availability?done=prefs");
}
