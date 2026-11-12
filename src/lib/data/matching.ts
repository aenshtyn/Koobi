import "server-only";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import type { ExploreOffer, PublicTeacher } from "@/domain/types";
import type { Candidate, RequestForRanking } from "@/domain/matching";

/**
 * Reads for requests, matching and messaging. They run with the signed-in user's session, so
 * row-level security and the sprint 3 functions decide what comes back. Call inside <Suspense>.
 */

export type RequestRow = RequestForRanking & {
  id: string;
  /** Null while a request sent without an account has not been linked to one yet. */
  requester_id: string | null;
  subject: string;
  goal: string;
  level: string | null;
  county: string | null;
  schedule_notes: string | null;
  notes: string | null;
  status: string;
  submitted_at: string;
  shortlisted_at: string | null;
  matched_at: string | null;
  created_at: string;
  format_pref?: string | null;
  /** From the public form (migration 20261108000200); absent on a database without it. */
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  preferred_times?: string[];
  preferred_days?: string[];
};

const REQUEST_COLS =
  "id, requester_id, category, track, subject, goal, level, mode, county, budget_max_kes, schedule_notes, notes, status, submitted_at, shortlisted_at, matched_at, created_at, format_pref";
const CONTACT_COLS = ", contact_name, contact_email, contact_phone, preferred_times, preferred_days";

type Read<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;
/** Reads requests with the contact columns, or without them on a database that does not have them yet. */
async function readRequests<T>(run: (cols: string) => Read<T>) {
  const full = await run(REQUEST_COLS + CONTACT_COLS);
  return full.error ? run(REQUEST_COLS) : full;
}

export type MatchRow = {
  id: string;
  offering_id: string;
  teacher_id: string;
  rank: number | null;
  status: string;
  concierge_reason: string | null;
  decline_reason: string | null;
  source: string;
  created_at: string;
};

async function db() {
  return serverClient();
}

// ---------------------------------------------------------------------------
// Learner

export async function getMyRequests(): Promise<RequestRow[]> {
  if (!hasSupabase) return [];
  const c = await db();
  const { data: auth } = await c.auth.getUser();
  if (!auth.user) return [];
  const uid = auth.user.id;
  const { data, error } = await readRequests((cols) => c.from("requests").select(cols).eq("requester_id", uid).order("created_at", { ascending: false }).limit(20));
  if (error) throw new Error(`requests: ${error.message}`);
  return (data ?? []) as unknown as RequestRow[];
}

export type MyRequestView = {
  request: RequestRow;
  matches: (MatchRow & { offer: ExploreOffer | null })[];
  threadId: string | null;
};

export async function getMyRequest(id: string): Promise<MyRequestView | null> {
  if (!hasSupabase || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const c = await db();
  const { data: request, error } = await readRequests((cols) => c.from("requests").select(cols).eq("id", id).maybeSingle());
  if (error) throw new Error(`requests: ${error.message}`);
  if (!request) return null;
  const { data: matches } = await c
    .from("matches")
    .select("id, offering_id, teacher_id, rank, status, concierge_reason, decline_reason, source, created_at")
    .eq("request_id", id)
    .in("status", ["sent", "accepted", "declined"])
    .order("rank");
  const ids = (matches ?? []).map((m) => m.offering_id);
  const { data: offers } = ids.length ? await c.from("explore_offers").select("*").in("id", ids) : { data: [] };
  const { data: threads } = await c.from("message_threads").select("id").eq("request_id", id).limit(1);
  return {
    request: request as unknown as RequestRow,
    matches: ((matches ?? []) as MatchRow[]).map((m) => ({ ...m, offer: ((offers ?? []) as ExploreOffer[]).find((o) => o.id === m.offering_id) ?? null })),
    threadId: threads?.[0]?.id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Staff: queue and console

export async function getRequestQueue(view: "open" | "shortlisted" | "closed"): Promise<RequestRow[]> {
  if (!hasSupabase) return [];
  const statuses = view === "open" ? ["submitted", "triaged"] : view === "shortlisted" ? ["shortlisted"] : ["matched", "unmatched", "withdrawn"];
  const c = await db();
  const { data, error } = await readRequests((cols) =>
    c.from("requests").select(cols).in("status", statuses).order("submitted_at", { ascending: view !== "closed" }).limit(100));
  if (error) throw new Error(`requests: ${error.message}`);
  return (data ?? []) as unknown as RequestRow[];
}

export type ConsoleView = {
  request: RequestRow;
  requesterName: string;
  minutes: number;
  matches: (MatchRow & { title: string | null })[];
  candidates: Candidate[];
};

export async function getConsole(id: string): Promise<ConsoleView | null> {
  if (!hasSupabase || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const c = await db();
  const { data: request, error } = await readRequests((cols) => c.from("requests").select(cols).eq("id", id).maybeSingle());
  if (error) throw new Error(`requests: ${error.message}`);
  if (!request) return null;
  const r = request as unknown as RequestRow;

  const [profile, minutes, matches, offers, apps] = await Promise.all([
    r.requester_id ? c.from("profiles").select("display_name").eq("id", r.requester_id).maybeSingle() : Promise.resolve({ data: null }),
    c.from("staff_time_log").select("minutes").eq("subject_type", "request").eq("subject_id", id),
    c.from("matches").select("id, offering_id, teacher_id, rank, status, concierge_reason, decline_reason, source, created_at, offerings(title)").eq("request_id", id).order("created_at"),
    c.from("explore_offers").select("*").eq("track", r.track).limit(200),
    c.from("teacher_applications").select("offering_id, pitch, proposed_price_kes, status").eq("request_id", id),
  ]);
  const offerRows = (offers.data ?? []) as ExploreOffer[];
  const slugs = [...new Set(offerRows.map((o) => o.teacher_slug))];
  const offerIds = offerRows.map((o) => o.id);
  const [teachers, windows, hours] = await Promise.all([
    slugs.length ? c.from("public_teachers").select("slug, response_time_minutes").in("slug", slugs) : Promise.resolve({ data: [] }),
    offerIds.length ? c.from("availability_windows").select("offering_id").in("offering_id", offerIds).eq("kind", "weekly") : Promise.resolve({ data: [] }),
    slugs.length ? c.from("teachers").select("slug, on_platform_hours").in("slug", slugs) : Promise.resolve({ data: [] }),
  ]);
  const t = (teachers.data ?? []) as Pick<PublicTeacher, "slug" | "response_time_minutes">[];
  const w = (windows.data ?? []) as { offering_id: string }[];
  const h = (hours.data ?? []) as { slug: string; on_platform_hours: number }[];
  const a = (apps.data ?? []) as { offering_id: string; pitch: string; proposed_price_kes: number | null; status: string }[];

  const candidates: Candidate[] = offerRows.map((o) => {
    const app = a.find((x) => x.offering_id === o.id && x.status !== "withdrawn");
    return {
      offering_id: o.id,
      title: o.title,
      slug: o.slug,
      teacher_name: o.teacher_name,
      teacher_headline: o.teacher_headline,
      teacher_slug: o.teacher_slug,
      category: o.category,
      track: o.track,
      modes: o.modes,
      session_price_kes: o.price_kes,
      duration_minutes: o.duration_minutes,
      tier: o.rank_tier ?? 0,
      rating_avg: o.rating_avg,
      review_count: o.review_count,
      response_minutes: t.find((x) => x.slug === o.teacher_slug)?.response_time_minutes ?? null,
      on_platform_hours: Number(h.find((x) => x.slug === o.teacher_slug)?.on_platform_hours ?? 0),
      weekly_windows: w.filter((x) => x.offering_id === o.id).length,
      applied: app ? { pitch: app.pitch, proposed_price_kes: app.proposed_price_kes } : null,
    };
  });

  return {
    request: r,
    requesterName: r.requester_id ? ((profile.data?.display_name as string | null)?.split(" ")[0] ?? "Requester") : (r.contact_name ?? "Guest"),
    minutes: ((minutes.data ?? []) as { minutes: number }[]).reduce((s, x) => s + x.minutes, 0),
    matches: ((matches.data ?? []) as unknown as (MatchRow & { offerings: { title: string } | null })[]).map(({ offerings, ...m }) => ({
      ...m,
      title: offerings?.title ?? null,
    })),
    candidates,
  };
}

// ---------------------------------------------------------------------------
// Teacher inbox

export type InboxRequest = {
  id: string;
  category: string;
  track: string;
  subject: string;
  goal: string;
  level: string | null;
  mode: string;
  county: string | null;
  budget_max_kes: number | null;
  schedule_notes: string | null;
  created_at: string;
  offering_ids: string[];
  applied: boolean;
};

export async function getTeacherInbox(): Promise<InboxRequest[]> {
  if (!hasSupabase) return [];
  const c = await db();
  const { data, error } = await c.rpc("open_requests_for_teacher");
  if (error) throw new Error(`open_requests_for_teacher: ${error.message}`);
  return (data ?? []) as InboxRequest[];
}

// ---------------------------------------------------------------------------
// Messaging

export type ThreadSummary = {
  id: string;
  kind: string;
  my_role: string;
  title: string;
  other_name: string;
  last_body: string | null;
  last_at: string;
  unread: number;
  contact_revealed: boolean;
};

export type Message = { id: string; sender_user_id: string; body: string; redacted: boolean; created_at: string; read_at?: string | null; attachment_key?: string | null; attachment_name?: string | null };

export async function getThreads(): Promise<ThreadSummary[]> {
  if (!hasSupabase) return [];
  const c = await db();
  const { data, error } = await c.rpc("my_threads");
  if (error) throw new Error(`my_threads: ${error.message}`);
  return (data ?? []) as ThreadSummary[];
}

export type ThreadDetails = {
  started_at: string;
  other_last_seen_at?: string | null;
  offering: { id: string; title: string; slug: string; format: string; published: boolean } | null;
  bookings: { id: string; title: string; kind: string; status: string; starts_at: string }[];
};

/**
 * What a conversation is about: the learning experience it opened for and the pair's bookings.
 * Null when it cannot be read (not a participant, or the database function is not there yet), so
 * the page shows the conversation without the details.
 */
export async function getThreadDetails(id: string): Promise<ThreadDetails | null> {
  if (!hasSupabase || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const c = await db();
  const { data, error } = await c.rpc("thread_details", { p_thread: id });
  if (error || !data) return null;
  return data as ThreadDetails;
}

/** The other side's phone number, once the pair's first paid booking has revealed it. */
export async function getThreadContact(id: string): Promise<string | null> {
  if (!hasSupabase || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const c = await db();
  const { data, error } = await c.rpc("thread_contact", { p_thread: id });
  return error ? null : ((data as string | null) ?? null);
}

export async function getThread(id: string): Promise<{ thread: ThreadSummary; messages: Message[]; me: string } | null> {
  if (!hasSupabase || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const c = await db();
  const read = (cols: string) => c.from("messages").select(cols).eq("thread_id", id).order("created_at").limit(500);
  const [{ data: auth }, threads, full] = await Promise.all([c.auth.getUser(), c.rpc("my_threads"), read("id, sender_user_id, body, redacted, created_at, read_at, attachment_key, attachment_name")]);
  // A database without the file columns yet still shows the conversation.
  const messages = full.error ? await read("id, sender_user_id, body, redacted, created_at") : full;
  const thread = ((threads.data ?? []) as ThreadSummary[]).find((t) => t.id === id);
  if (!thread || !auth.user) return null;
  return { thread, messages: (messages.data ?? []) as unknown as Message[], me: auth.user.id };
}
