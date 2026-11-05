import "server-only";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { getMyBookings, getTeachingBookings, type MyBooking, type TeachingBooking } from "@/lib/data/bookings";

/**
 * Reads for the lesson itself: the session, the teacher's note, problems reported, reviews and
 * credit. Row-level security decides what each person sees. Call inside <Suspense>.
 */

export type SessionRow = {
  id: string;
  booking_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  actual_minutes: number | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
};

export type NoteRow = { session_id: string; covered: string; progress: string | null; next_steps: string | null; filed_at: string };

export type DisputeRow = {
  id: string;
  booking_id: string;
  type: string;
  status: string;
  description: string | null;
  outcome: string | null;
  credit_kes: number;
  refund_kes: number;
  sla_due_at: string;
  created_at: string;
  resolved_at: string | null;
  evidence_snapshot: { resolution_note?: string } | null;
};

export type ReviewRow = {
  id: string;
  booking_id: string;
  rating: number;
  body: string | null;
  teacher_reply: string | null;
  teacher_replied_at: string | null;
  status: string;
  created_at: string;
};

const SESSION_COLS = "id, booking_id, starts_at, ends_at, status, checked_in_at, checked_out_at, actual_minutes, confirmed_at, confirmed_by";
const DISPUTE_COLS = "id, booking_id, type, status, description, outcome, credit_kes, refund_kes, sla_due_at, created_at, resolved_at, evidence_snapshot";
const REVIEW_COLS = "id, booking_id, rating, body, teacher_reply, teacher_replied_at, status, created_at";

const isId = (id: string) => /^[0-9a-f-]{36}$/.test(id);

export type LessonExtras = { session: SessionRow | null; note: NoteRow | null; disputes: DisputeRow[]; review: ReviewRow | null };

export async function getLessonExtras(bookingId: string): Promise<LessonExtras> {
  const empty = { session: null, note: null, disputes: [], review: null };
  if (!hasSupabase || !isId(bookingId)) return empty;
  const db = await serverClient();
  const [session, disputes, review] = await Promise.all([
    db.from("sessions").select(SESSION_COLS).eq("booking_id", bookingId).maybeSingle(),
    db.from("disputes").select(DISPUTE_COLS).eq("booking_id", bookingId).order("created_at", { ascending: false }),
    db.from("reviews").select(REVIEW_COLS).eq("booking_id", bookingId).maybeSingle(),
  ]);
  const s = (session.data as SessionRow | null) ?? null;
  const note = s ? await db.from("lesson_notes").select("session_id, covered, progress, next_steps, filed_at").eq("session_id", s.id).maybeSingle() : null;
  return {
    session: s,
    note: (note?.data as NoteRow | null) ?? null,
    disputes: (disputes.data ?? []) as DisputeRow[],
    review: (review.data as ReviewRow | null) ?? null,
  };
}

/** The payer's booking with everything about the lesson. */
export async function getMyLesson(bookingId: string): Promise<(LessonExtras & { booking: MyBooking }) | null> {
  const booking = (await getMyBookings()).find((b) => b.id === bookingId);
  if (!booking) return null;
  return { booking, ...(await getLessonExtras(bookingId)) };
}

/** The teacher's view of one lesson, by session id. */
export async function getTeachSession(sessionId: string): Promise<{ session: SessionRow; booking: TeachingBooking; note: NoteRow | null } | null> {
  if (!hasSupabase || !isId(sessionId)) return null;
  const db = await serverClient();
  const { data } = await db.from("sessions").select(SESSION_COLS).eq("id", sessionId).maybeSingle();
  const session = data as SessionRow | null;
  if (!session) return null;
  const booking = (await getTeachingBookings()).find((b) => b.id === session.booking_id);
  if (!booking) return null;
  const { data: note } = await db.from("lesson_notes").select("session_id, covered, progress, next_steps, filed_at").eq("session_id", session.id).maybeSingle();
  return { session, booking, note: (note as NoteRow | null) ?? null };
}

/** Session ids for a set of bookings (both sides can read their own). */
export async function getSessionsFor(bookingIds: string[]): Promise<SessionRow[]> {
  if (!hasSupabase || !bookingIds.length) return [];
  const db = await serverClient();
  const { data } = await db.from("sessions").select(SESSION_COLS).in("booking_id", bookingIds);
  return (data ?? []) as SessionRow[];
}

export async function getMyDispute(id: string): Promise<{ dispute: DisputeRow; booking: MyBooking } | null> {
  if (!hasSupabase || !isId(id)) return null;
  const db = await serverClient();
  const { data } = await db.from("disputes").select(DISPUTE_COLS).eq("id", id).maybeSingle();
  const dispute = data as DisputeRow | null;
  if (!dispute) return null;
  const booking = (await getMyBookings()).find((b) => b.id === dispute.booking_id);
  return booking ? { dispute, booking } : null;
}

export type TeacherReview = ReviewRow & { title: string; learner_alias: string; starts_at: string };

export async function getTeacherReviews(): Promise<TeacherReview[]> {
  if (!hasSupabase) return [];
  const db = await serverClient();
  const bookings = await getTeachingBookings();
  if (!bookings.length) return [];
  const { data, error } = await db
    .from("reviews")
    .select(REVIEW_COLS)
    .in("booking_id", bookings.map((b) => b.id))
    .order("created_at", { ascending: false });
  if (error) throw new Error(`reviews: ${error.message}`);
  return ((data ?? []) as ReviewRow[]).map((r) => {
    const b = bookings.find((x) => x.id === r.booking_id)!;
    return { ...r, title: b.title, learner_alias: b.learner_alias, starts_at: b.starts_at };
  });
}

export type CreditLine = {
  payment_id: string;
  platform_ref: string;
  booking_id: string | null;
  title: string | null;
  credit_kes: number;
  open_refund_kes: number;
  refunded_kes: number;
  last_refund_status: string | null;
  updated_at: string | null;
};

export async function getCredits(): Promise<{ balance: number; lines: CreditLine[] }> {
  if (!hasSupabase) return { balance: 0, lines: [] };
  const db = await serverClient();
  const [balance, lines] = await Promise.all([db.rpc("my_credit_balance"), db.rpc("my_credit_lines")]);
  if (lines.error) throw new Error(`my_credit_lines: ${lines.error.message}`);
  return { balance: (balance.data as number | null) ?? 0, lines: (lines.data ?? []) as CreditLine[] };
}

/** Notes for one learner the caller pays for, newest first (L14). */
export async function getProgress(learnerId: string): Promise<{ alias: string; items: { booking: MyBooking; note: NoteRow }[] } | null> {
  if (!hasSupabase || !isId(learnerId)) return null;
  const db = await serverClient();
  const { data: learner } = await db.from("learners").select("id, alias").eq("id", learnerId).maybeSingle();
  if (!learner) return null;
  const { data: bookings } = await db.from("bookings").select("id").eq("learner_id", learnerId);
  const ids = ((bookings ?? []) as { id: string }[]).map((b) => b.id);
  const sessions = await getSessionsFor(ids);
  const { data: notes } = sessions.length
    ? await db.from("lesson_notes").select("session_id, covered, progress, next_steps, filed_at").in("session_id", sessions.map((s) => s.id)).order("filed_at", { ascending: false })
    : { data: [] };
  const mine = await getMyBookings();
  const items = ((notes ?? []) as NoteRow[])
    .map((note) => {
      const s = sessions.find((x) => x.id === note.session_id);
      const booking = mine.find((b) => b.id === s?.booking_id);
      return booking ? { booking, note } : null;
    })
    .filter((x): x is { booking: MyBooking; note: NoteRow } => !!x);
  return { alias: learner.alias as string, items };
}
