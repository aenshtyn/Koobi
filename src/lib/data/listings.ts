import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { hasSupabase } from "@/lib/supabase/config";
import { publicClient } from "@/lib/supabase/public";
import { serverClient } from "@/lib/supabase/server";
import type { ListingState } from "@/domain/listing";

/**
 * Reads for the teacher area and the staff approvals queue. They run with the signed-in user's
 * session, so row-level security decides what comes back: a teacher sees only their own rows,
 * staff see everything. Call inside a <Suspense> boundary (they read cookies).
 */

export type MyTeacher = {
  id: string;
  slug: string;
  display_name: string;
  headline: string | null;
  bio: string | null;
  languages: string[];
  county_code: string | null;
  teacher_type: string | null;
  employment_status: string | null;
  employment_declared_at: string | null;
  listing_status: ListingState;
  rejection_reason: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  status: string;
  tracks: string[];
};

export type MyOffer = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  outcomes: string[];
  category: string;
  track: string;
  format: string;
  subject_text: string | null;
  curriculum_code: string | null;
  goal: string | null;
  modes: string[];
  meeting_tool: string | null;
  duration_minutes: number;
  price_hour_kes: number | null;
  price_seat_kes: number | null;
  capacity_min: number | null;
  capacity_max: number | null;
  sessions_in_run: number | null;
  price_pkg8_kes: number | null;
  price_pkg12_kes: number | null;
  price_pkg16_kes: number | null;
  trial_discount_pct: number | null;
  language_codes: string[];
  listing_status: ListingState;
  rejection_reason: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  updated_at: string;
};

export type Window = { id: string; offering_id: string; weekday: number; starts: string; ends: string };

const TEACHER_COLS =
  "id, slug, display_name, headline, bio, languages, county_code, teacher_type, employment_status, employment_declared_at, listing_status, rejection_reason, submitted_at, approved_at, status, teacher_tracks(track)";
const OFFER_COLS =
  "id, slug, title, summary, description, outcomes, category, track, format, subject_text, curriculum_code, goal, modes, meeting_tool, duration_minutes, price_hour_kes, price_seat_kes, capacity_min, capacity_max, sessions_in_run, price_pkg8_kes, price_pkg12_kes, price_pkg16_kes, trial_discount_pct, language_codes, listing_status, rejection_reason, submitted_at, approved_at, updated_at";

type TeacherRow = Omit<MyTeacher, "tracks"> & { teacher_tracks: { track: string }[] | null };
const toTeacher = ({ teacher_tracks, ...t }: TeacherRow): MyTeacher => ({ ...t, tracks: (teacher_tracks ?? []).map((x) => x.track) });

export async function getMyTeacher(): Promise<MyTeacher | null> {
  if (!hasSupabase) return null;
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await db.from("teachers").select(TEACHER_COLS).eq("user_id", auth.user.id).maybeSingle();
  if (error) throw new Error(`teachers: ${error.message}`);
  return data ? toTeacher(data as unknown as TeacherRow) : null;
}

export async function getMyOffers(teacherId: string): Promise<MyOffer[]> {
  const db = await serverClient();
  const { data, error } = await db.from("offerings").select(OFFER_COLS).eq("teacher_id", teacherId).order("updated_at", { ascending: false });
  if (error) throw new Error(`offerings: ${error.message}`);
  return (data ?? []) as MyOffer[];
}

export async function getMyOffer(id: string): Promise<MyOffer | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const db = await serverClient();
  const { data, error } = await db.from("offerings").select(OFFER_COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(`offerings: ${error.message}`);
  return (data as MyOffer | null) ?? null;
}

export async function getWindows(offerIds: string[]): Promise<Window[]> {
  if (!offerIds.length) return [];
  const db = await serverClient();
  const { data, error } = await db
    .from("availability_windows")
    .select("id, offering_id, weekday, starts, ends")
    .in("offering_id", offerIds)
    .eq("kind", "weekly")
    .order("weekday")
    .order("starts");
  if (error) throw new Error(`availability_windows: ${error.message}`);
  return ((data ?? []) as Window[]).map((w) => ({ ...w, starts: w.starts.slice(0, 5), ends: w.ends.slice(0, 5) }));
}

/** Counties are public taxonomy: cached, cookie-free. */
export async function getCounties(): Promise<{ code: string; label: string }[]> {
  "use cache";
  cacheTag("taxonomy");
  cacheLife("days");
  if (!hasSupabase) return [{ code: "nairobi", label: "Nairobi" }];
  const { data, error } = await publicClient().from("counties").select("code, label").order("label");
  if (error) throw new Error(`counties: ${error.message}`);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Staff: the approvals queue (reviewer and admin decide; concierge can look)

export type PendingTeacher = MyTeacher & { user_id: string };
export type PendingOffer = MyOffer & { teacher: { display_name: string; slug: string; listing_status: ListingState } | null };

export async function getPendingListings(): Promise<{ teachers: PendingTeacher[]; offers: PendingOffer[] }> {
  if (!hasSupabase) return { teachers: [], offers: [] };
  const db = await serverClient();
  const [t, o] = await Promise.all([
    db.from("teachers").select(`user_id, ${TEACHER_COLS}`).eq("listing_status", "pending_review").order("submitted_at"),
    db
      .from("offerings")
      .select(`${OFFER_COLS}, teacher:teachers(display_name, slug, listing_status)`)
      .eq("listing_status", "pending_review")
      .order("submitted_at"),
  ]);
  if (t.error) throw new Error(`teachers: ${t.error.message}`);
  if (o.error) throw new Error(`offerings: ${o.error.message}`);
  return {
    teachers: ((t.data ?? []) as unknown as (TeacherRow & { user_id: string })[]).map((r) => ({ ...toTeacher(r), user_id: r.user_id })),
    offers: (o.data ?? []) as unknown as PendingOffer[],
  };
}

/** Hourly price bands in force (dated parameters; the database enforces them on every offer). */
export async function getPriceBands(): Promise<Record<string, { min: number; max: number }>> {
  if (!hasSupabase) return {};
  const db = await serverClient();
  const { data } = await db.rpc("price_bands");
  return (data as Record<string, { min: number; max: number }> | null) ?? {};
}

// ---------------------------------------------------------------------------
// The expert's schedule (Availability & Schedule): one weekly schedule and one list of blocked dates,
// stored on every one-to-one learning experience.

export type ScheduleRow = { id: string; offering_id: string; kind: "weekly" | "blocked" | "extra"; weekday: number | null; starts: string | null; ends: string | null; exception_date: string | null };

export async function getScheduleRows(offerIds: string[]): Promise<ScheduleRow[]> {
  if (!offerIds.length) return [];
  const db = await serverClient();
  const { data, error } = await db.from("availability_windows").select("id, offering_id, kind, weekday, starts, ends, exception_date").in("offering_id", offerIds);
  if (error) throw new Error(`availability_windows: ${error.message}`);
  return ((data ?? []) as ScheduleRow[]).map((w) => ({ ...w, starts: w.starts?.slice(0, 5) ?? null, ends: w.ends?.slice(0, 5) ?? null }));
}

/** The expert's own booking rules; the defaults when they cannot be read (or the database is not updated yet). */
export async function getBookingPrefs(): Promise<{ min_notice_hours: number; advance_days: number; buffer_minutes: number; saved: boolean }> {
  const fallback = { min_notice_hours: 2, advance_days: 28, buffer_minutes: 0, saved: false };
  if (!hasSupabase) return fallback;
  const db = await serverClient();
  const { data, error } = await db.rpc("my_booking_preferences").maybeSingle();
  if (error || !data) return fallback;
  return { ...(data as { min_notice_hours: number; advance_days: number; buffer_minutes: number }), saved: true };
}

/** The expert's own packages for one learning experience; empty when there are none (or the table is not there yet). */
export async function getOwnPackages(offeringId: string): Promise<{ name: string; description: string | null; sessions: number; price_kes: number; validity_weeks: number | null }[]> {
  if (!hasSupabase) return [];
  const db = await serverClient();
  const { data, error } = await db.from("offering_packages").select("name, description, sessions, price_kes, validity_weeks, position").eq("offering_id", offeringId).order("position");
  return error ? [] : ((data ?? []) as { name: string; description: string | null; sessions: number; price_kes: number; validity_weeks: number | null }[]);
}
