import "server-only";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";

/** Reads for the verification screens (T2–T9, S3, S4, S8, S18). */

export type MyCheck = {
  id: string;
  offering_id: string | null;
  track: string | null;
  tier: number;
  check_type: string;
  check_label: string;
  badge_label: string | null;
  status: string;
  passed_at: string | null;
  expires_at: string | null;
  created_at: string;
  failure_reason: string | null;
  attempt_no: number;
};

export type MyDoc = { check_id: string; kind: string; uploaded_at: string };

export async function getMyChecks(): Promise<{ checks: MyCheck[]; docs: MyDoc[]; teacherId: string | null; tracks: { track: string; tier: number; waitlist_status: string }[] }> {
  if (!hasSupabase) return { checks: [], docs: [], teacherId: null, tracks: [] };
  const db = await serverClient();
  const { data: tid } = await db.rpc("my_teacher_id");
  const teacherId = (tid as string | null) ?? null;
  if (!teacherId) return { checks: [], docs: [], teacherId: null, tracks: [] };
  const [checks, docs, tracks] = await Promise.all([
    db.from("my_verification_checks").select("*").eq("teacher_id", teacherId).order("created_at", { ascending: false }),
    db.rpc("my_check_documents"),
    db.from("teacher_tracks").select("track, tier, waitlist_status").eq("teacher_id", teacherId),
  ]);
  if (checks.error) throw new Error(`my_verification_checks: ${checks.error.message}`);
  return {
    checks: (checks.data ?? []) as MyCheck[],
    docs: (docs.data ?? []) as MyDoc[],
    teacherId,
    tracks: (tracks.data ?? []) as { track: string; tier: number; waitlist_status: string }[],
  };
}

/** The newest check of a type (and offering), the one a screen works on. */
export function latest(checks: MyCheck[], type: string, offeringId: string | null = null) {
  return checks.find((c) => c.check_type === type && (c.offering_id ?? null) === offeringId) ?? null;
}

export type ReviewItem = {
  id: string;
  check_type: string;
  status: string;
  tier: number;
  attempt_no: number;
  created_at: string;
  updated_at: string;
  result_summary: Record<string, unknown>;
  failure_reason: string | null;
  expires_at: string | null;
  staff_minutes: number;
  offering_id: string | null;
  teacher: { id: string; display_name: string; slug: string } | null;
  check: { label: string } | null;
};

export async function getReviewQueue(view: "waiting" | "decided"): Promise<ReviewItem[]> {
  if (!hasSupabase) return [];
  const db = await serverClient();
  let q = db
    .from("verification_checks")
    .select("id, check_type, status, tier, attempt_no, created_at, updated_at, result_summary, failure_reason, expires_at, staff_minutes, offering_id, teacher:teachers(id, display_name, slug), check:check_types(label)")
    .limit(100);
  q = view === "waiting" ? q.eq("status", "in_review").order("updated_at") : q.in("status", ["passed", "failed"]).order("reviewed_at", { ascending: false });
  const { data, error } = await q;
  if (error) throw new Error(`verification_checks: ${error.message}`);
  return (data ?? []) as unknown as ReviewItem[];
}

export async function getReviewItem(id: string): Promise<{ item: ReviewItem; docs: { id: string; kind: string; uploaded_at: string }[] } | null> {
  if (!hasSupabase || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const db = await serverClient();
  const { data, error } = await db
    .from("verification_checks")
    .select("id, check_type, status, tier, attempt_no, created_at, updated_at, result_summary, failure_reason, expires_at, staff_minutes, offering_id, teacher:teachers(id, display_name, slug), check:check_types(label)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`verification_checks: ${error.message}`);
  if (!data) return null;
  const { data: docs } = await db.rpc("check_documents", { p_check: id });
  return { item: data as unknown as ReviewItem, docs: (docs ?? []) as { id: string; kind: string; uploaded_at: string }[] };
}

export type DirectoryTeacher = {
  id: string;
  slug: string;
  display_name: string;
  listing_status: string;
  status: string;
  status_reason: string | null;
  payout_ownership_status: string;
  has_kra: boolean;
  created_at: string;
  tracks: { track: string; tier: number; waitlist_status: string }[];
};

export async function getTeacherDirectory(): Promise<DirectoryTeacher[]> {
  if (!hasSupabase) return [];
  const db = await serverClient();
  const { data, error } = await db
    .from("teachers")
    .select("id, slug, display_name, listing_status, status, status_reason, payout_ownership_status, kra_pin_enc, created_at, teacher_tracks(track, tier, waitlist_status)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(`teachers: ${error.message}`);
  return ((data ?? []) as unknown as (Omit<DirectoryTeacher, "has_kra" | "tracks"> & { kra_pin_enc: string | null; teacher_tracks: DirectoryTeacher["tracks"] })[]).map(
    ({ kra_pin_enc, teacher_tracks, ...t }) => ({ ...t, has_kra: !!kra_pin_enc, tracks: teacher_tracks ?? [] }),
  );
}
