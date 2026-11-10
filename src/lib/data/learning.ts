import "server-only";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { getMyBookings, type MyBooking } from "@/lib/data/bookings";
import { getMySeat, type MySeat } from "@/lib/data/runs";
import { getMyPackages, type PackageRow } from "@/lib/data/account";
import type { ReviewRow } from "@/lib/data/lessons";
import { activitiesOf, experiencesOf, groupOf, type ActivityOf, type ExperienceOf, type LearnerGroup } from "@/domain/learning";
import { isFormatCode, type FormatCode } from "@/domain/taxonomy";

/**
 * Reads for the learner workspace (Home, My Learning, My Bookings, My Schedule, Following, Payments,
 * My Reviews, My Profile). Everything is the signed-in person's own records, as row-level security
 * returns them. A part that cannot be read (for example a database function not there yet) comes
 * back empty so the page still opens. Call inside <Suspense>.
 */

export type LearnerBooking = MyBooking & {
  format: FormatCode;
  group: LearnerGroup;
  teacher_slug: string | null;
  teacher_headline: string | null;
  category: string | null;
  package_id: string | null;
  /** The pair's conversation, when one is open. */
  thread_id: string | null;
  reviewed: boolean;
  /** For a seat in a group: its sessions, attendance and meeting link. */
  seat: MySeat | null;
  /** When to show it: a seat's next session (or its last one once over), otherwise the lesson's start. */
  when: string;
  ends: string;
};

type Extra = { id: string; package_id: string | null; teacher_id: string };
type Offer = { id: string; format: string; teacher_slug: string; teacher_headline: string | null; category: string };

const endOf = (start: string, minutes: number) => new Date(new Date(start).getTime() + minutes * 60_000).toISOString();

export async function getLearnerBookings(): Promise<LearnerBooking[]> {
  if (!hasSupabase) return [];
  // A booking that was dropped before paying is not shown anywhere.
  const mine = (await getMyBookings()).filter((b) => !(b.status === "cancelled" && !b.paid_at));
  if (!mine.length) return [];
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  const uid = auth.user?.id ?? "";
  const offeringIds = [...new Set(mine.map((b) => b.offering_id))];
  const [extras, offers, reviews, threads, seats] = await Promise.all([
    db.from("bookings").select("id, package_id, teacher_id").eq("booked_by_user_id", uid).limit(1000),
    db.from("explore_offers").select("id, format, teacher_slug, teacher_headline, category").in("id", offeringIds),
    db.from("reviews").select("booking_id").eq("author_user_id", uid).limit(1000),
    db.from("message_threads").select("id, match_id, booking_id").eq("kind", "pair").limit(200),
    Promise.all(mine.filter((b) => b.kind === "seat").map(async (b) => [b.id, await getMySeat(b.id)] as const)),
  ]);
  const extra = new Map(((extras.data ?? []) as Extra[]).map((e) => [e.id, e]));
  const offer = new Map(((offers.data ?? []) as Offer[]).map((o) => [o.id, o]));
  const reviewed = new Set(((reviews.data ?? []) as { booking_id: string }[]).map((r) => r.booking_id));
  const seat = new Map(seats);

  // A conversation belongs to an expert: through the shortlist match it opened from, or its booking.
  const threadRows = (threads.data ?? []) as { id: string; match_id: string | null; booking_id: string | null }[];
  const matchIds = threadRows.map((t) => t.match_id).filter((x): x is string => !!x);
  const { data: matches } = matchIds.length ? await db.from("matches").select("id, teacher_id").in("id", matchIds) : { data: [] };
  const matchTeacher = new Map(((matches ?? []) as { id: string; teacher_id: string }[]).map((m) => [m.id, m.teacher_id]));
  const threadOf = new Map<string, string>();
  for (const t of threadRows) {
    const teacher = (t.match_id && matchTeacher.get(t.match_id)) || (t.booking_id && extra.get(t.booking_id)?.teacher_id);
    if (teacher && !threadOf.has(teacher)) threadOf.set(teacher, t.id);
  }

  const now = Date.now();
  return mine.map((b) => {
    const e = extra.get(b.id);
    const o = offer.get(b.offering_id);
    const s = seat.get(b.id) ?? null;
    const fromSeat = s && isFormatCode(s.format) ? s.format : null;
    const format: FormatCode = fromSeat ?? (o && isFormatCode(o.format) ? o.format : b.kind === "seat" ? "small_group" : "one_to_one");
    const live = s?.sessions.filter((x) => x.status !== "cancelled") ?? [];
    const next = live.find((x) => new Date(x.ends_at).getTime() > now) ?? live.at(-1);
    return {
      ...b,
      format,
      group: groupOf(b.status),
      teacher_slug: o?.teacher_slug ?? null,
      teacher_headline: o?.teacher_headline ?? null,
      category: o?.category ?? null,
      package_id: e?.package_id ?? null,
      thread_id: (e && threadOf.get(e.teacher_id)) ?? null,
      reviewed: reviewed.has(b.id),
      seat: s,
      when: next?.starts_at ?? b.starts_at,
      ends: next?.ends_at ?? endOf(b.starts_at, b.duration_minutes),
    };
  });
}

// ---------------------------------------------------------------------------
// My Learning (one card per learning experience) and My Schedule (every dated activity).
// The rules are in domain/learning; these give them the learner's records.

export type Experience = ExperienceOf<LearnerBooking, PackageRow>;
export type Activity = ActivityOf<LearnerBooking>;

export function buildActivities(bookings: LearnerBooking[]): Activity[] {
  return activitiesOf(bookings);
}

export async function getExperiences(): Promise<{ experiences: Experience[]; bookings: LearnerBooking[] }> {
  const [bookings, packages] = await Promise.all([getLearnerBookings(), getMyPackages()]);
  return { experiences: experiencesOf(bookings, packages, new Date()), bookings };
}

// ---------------------------------------------------------------------------
// Following

export type Followed = {
  slug: string;
  display_name: string;
  headline: string | null;
  followed_at: string;
  visible: boolean;
  experiences: number;
  categories: string[];
  latest_title: string | null;
  latest_slug: string | null;
  latest_format: string | null;
  latest_at: string | null;
};

/** `ready` is false when the database does not have following yet (the migration has not been pushed). */
export async function getFollowing(): Promise<{ ready: boolean; items: Followed[] }> {
  if (!hasSupabase) return { ready: false, items: [] };
  const db = await serverClient();
  const { data, error } = await db.rpc("my_following");
  return error ? { ready: false, items: [] } : { ready: true, items: (data ?? []) as Followed[] };
}

// ---------------------------------------------------------------------------
// Payments & Transactions

export type RefundLine = { id: string; payment_id: string; platform_ref: string; amount_kes: number; status: string; created_at: string; completed_at: string | null };
export type Transaction = {
  id: string;
  platform_ref: string;
  method: string;
  amount_kes: number;
  status: string;
  failure_reason: string | null;
  created_at: string;
  succeeded_at: string | null;
  booking_id: string | null;
  package_id: string | null;
  title: string | null;
  teacher_name: string | null;
  learner_alias: string | null;
  refunds: RefundLine[];
  /** Money that has gone back to the payer for this payment. */
  refunded_kes: number;
};

export async function getTransactions(): Promise<Transaction[]> {
  if (!hasSupabase) return [];
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return [];
  const [payments, refunds, bookings, packages] = await Promise.all([
    db
      .from("payments")
      .select("id, booking_id, package_id, platform_ref, method, amount_kes, status, failure_reason, created_at, succeeded_at")
      .eq("payer_user_id", auth.user.id)
      .in("status", ["pending", "succeeded", "failed", "refunded", "partially_refunded", "charged_back"])
      .order("created_at", { ascending: false })
      .limit(500),
    db.from("refunds").select("id, payment_id, platform_ref, amount_kes, status, created_at, completed_at").order("created_at", { ascending: false }).limit(500),
    getMyBookings(),
    getMyPackages(),
  ]);
  if (payments.error) throw new Error(`payments: ${payments.error.message}`);
  const lines = (refunds.data ?? []) as RefundLine[];
  type Raw = Omit<Transaction, "title" | "teacher_name" | "learner_alias" | "refunds" | "refunded_kes">;
  return ((payments.data ?? []) as Raw[]).map((p) => {
    const b = p.booking_id ? bookings.find((x) => x.id === p.booking_id) : undefined;
    const k = p.package_id ? packages.find((x) => x.id === p.package_id) : undefined;
    const mine = lines.filter((r) => r.payment_id === p.id);
    return {
      ...p,
      title: b?.title ?? (k?.offering ? `${k.offering.title} (package of ${k.sessions_total})` : null),
      teacher_name: b?.teacher_name ?? k?.teacher?.display_name ?? null,
      learner_alias: b?.learner_alias ?? k?.learner?.alias ?? null,
      refunds: mine,
      refunded_kes: mine.filter((r) => r.status === "succeeded").reduce((n, r) => n + r.amount_kes, 0),
    };
  });
}

// ---------------------------------------------------------------------------
// My Reviews

export async function getMyReviews(): Promise<ReviewRow[]> {
  if (!hasSupabase) return [];
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return [];
  const { data } = await db
    .from("reviews")
    .select("id, booking_id, rating, body, teacher_reply, teacher_replied_at, status, created_at")
    .eq("author_user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? []) as ReviewRow[];
}

// ---------------------------------------------------------------------------
// My Profile

export type LearnerProfile = {
  name: string | null;
  email: string | null;
  phone: string | null;
  country_code: string;
  locale: string;
  member_since: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  /** Null when the database does not have learning preferences yet. */
  prefs: { categories: string[]; formats: string[]; languages: string[] } | null;
};

export async function getLearnerProfile(): Promise<LearnerProfile | null> {
  if (!hasSupabase) return null;
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data } = await db.from("profiles").select("*").eq("id", auth.user.id).maybeSingle();
  const p = (data ?? {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? (v as string[]) : null);
  const categories = list(p.interest_categories);
  return {
    name: (p.display_name as string | null) ?? null,
    email: (p.email as string | null) ?? auth.user.email ?? null,
    phone: (p.phone_e164 as string | null) ?? (auth.user.phone ? `+${auth.user.phone.replace(/^\+/, "")}` : null),
    country_code: (p.country_code as string | undefined) ?? "KE",
    locale: (p.locale as string | undefined) ?? "en",
    member_since: (p.created_at as string | null) ?? null,
    emailVerified: !!auth.user.email_confirmed_at,
    phoneVerified: !!auth.user.phone_confirmed_at,
    prefs: categories ? { categories, formats: list(p.preferred_formats) ?? [], languages: list(p.preferred_languages) ?? [] } : null,
  };
}

// ---------------------------------------------------------------------------
// Open requests to move a lesson, by booking

export async function getOpenReschedules(): Promise<Map<string, import("@/lib/data/bookings").Reschedule>> {
  const out = new Map<string, import("@/lib/data/bookings").Reschedule>();
  if (!hasSupabase) return out;
  const db = await serverClient();
  const { data, error } = await db
    .from("booking_reschedules")
    .select("id, booking_id, by_role, new_starts_at, expires_at")
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .limit(200);
  if (error) return out;
  for (const r of (data ?? []) as (import("@/lib/data/bookings").Reschedule & { booking_id: string })[]) out.set(r.booking_id, r);
  return out;
}
