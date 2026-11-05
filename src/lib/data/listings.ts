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
  "id, slug, title, summary, description, outcomes, category, track, format, subject_text, curriculum_code, goal, modes, meeting_tool, duration_minutes, price_hour_kes, trial_discount_pct, language_codes, listing_status, rejection_reason, submitted_at, approved_at, updated_at";

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
