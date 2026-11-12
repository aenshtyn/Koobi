import "server-only";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { NO_REQUIREMENTS, type Application, type ApplicationStatus, type CredentialKind, type Requirements, type VideoStatus } from "@/domain/expert";

/**
 * Reads for the expert application, the Public Profile pages and the staff screens that review them.
 * They run with the signed-in person's session: an expert sees only their own rows, staff see all.
 * Call inside a <Suspense> boundary (they read cookies).
 */

export type MyApplication = Application & {
  id: string;
  slug: string;
  user_id: string;
  application_status: ApplicationStatus;
  application_step: number;
  application_submitted_at: string | null;
  application_decided_at: string | null;
  application_note: string | null;
  terms_accepted_at: string | null;
  meeting_at: string | null;
  meeting_link: string | null;
  meeting_invited_at: string | null;
  meeting_held_at: string | null;
  listing_status: string;
  status: string;
  profile_published_at: string | null;
  created_at: string;
};

const APPLICATION_COLS =
  "id, slug, user_id, display_name, contact_phone, country_code, city, photo_url, headline, bio, education_level, education_field, experience_band, achievements, employment_status, employer, website_url, primary_category, specialisations, audiences, languages, formats_offered, learner_outcomes, portfolio_links, application_status, application_step, application_submitted_at, application_decided_at, application_note, terms_accepted_at, meeting_at, meeting_link, meeting_invited_at, meeting_held_at, listing_status, status, profile_published_at, created_at";

/** `ready` is false while the onboarding migration is not on this database yet. */
export async function getMyApplication(): Promise<{ ready: boolean; app: MyApplication | null }> {
  if (!hasSupabase) return { ready: false, app: null };
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { ready: true, app: null };
  const { data, error } = await db.from("teachers").select(APPLICATION_COLS).eq("user_id", auth.user.id).maybeSingle();
  if (error?.code === "42703") return { ready: false, app: null };
  if (error) throw new Error(`teachers: ${error.message}`);
  return { ready: true, app: (data as unknown as MyApplication | null) ?? null };
}

export type Credential = {
  id: string;
  teacher_id: string;
  kind: CredentialKind;
  title: string;
  issuer: string | null;
  file_name: string | null;
  status: "submitted" | "approved" | "rejected";
  note: string | null;
  reviewed_at: string | null;
  created_at: string;
};
const CREDENTIAL_COLS = "id, teacher_id, kind, title, issuer, file_name, status, note, reviewed_at, created_at";

export async function getCredentials(teacherId: string): Promise<Credential[]> {
  if (!hasSupabase) return [];
  const db = await serverClient();
  const { data, error } = await db.from("teacher_credentials").select(CREDENTIAL_COLS).eq("teacher_id", teacherId).is("deleted_at", null).order("created_at");
  return error ? [] : ((data ?? []) as Credential[]);
}

export type Video = {
  id: string;
  teacher_id: string;
  mime: string;
  size_bytes: number;
  duration_seconds: number;
  status: VideoStatus;
  note: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
};
const VIDEO_COLS = "id, teacher_id, mime, size_bytes, duration_seconds, status, note, submitted_at, reviewed_at, created_at";

/** Newest first. */
export async function getVideos(teacherId: string): Promise<Video[]> {
  if (!hasSupabase) return [];
  const db = await serverClient();
  const { data, error } = await db.from("teacher_videos").select(VIDEO_COLS).eq("teacher_id", teacherId).order("created_at", { ascending: false }).limit(12);
  return error ? [] : ((data ?? []) as Video[]);
}

/** The video the expert is working on (the newest that was not replaced), and the one that is live. */
export function currentVideos(videos: Video[]): { working: Video | null; live: Video | null } {
  const live = videos.find((v) => v.status === "approved") ?? null;
  const working = videos.find((v) => v.status !== "replaced") ?? null;
  return { working, live };
}

export type ProfileChange = {
  id: string;
  teacher_id: string;
  changes: Record<string, unknown>;
  identity_recheck: boolean;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** The draft waiting for review, and the last one that was sent back (so its note can be shown). */
export async function getProfileChanges(teacherId: string): Promise<{ pending: ProfileChange | null; lastRejected: ProfileChange | null }> {
  if (!hasSupabase) return { pending: null, lastRejected: null };
  const db = await serverClient();
  const { data, error } = await db.from("teacher_profile_changes").select("*").eq("teacher_id", teacherId).in("status", ["pending", "rejected"]).order("created_at", { ascending: false }).limit(5);
  if (error) return { pending: null, lastRejected: null };
  const rows = (data ?? []) as ProfileChange[];
  const pending = rows.find((r) => r.status === "pending") ?? null;
  const newest = rows[0] ?? null;
  return { pending, lastRejected: newest && newest.status === "rejected" ? newest : null };
}

export async function getMyRequirements(): Promise<Requirements> {
  if (!hasSupabase) return NO_REQUIREMENTS;
  const db = await serverClient();
  const { data, error } = await db.rpc("my_profile_requirements");
  return error || !data ? NO_REQUIREMENTS : { ...NO_REQUIREMENTS, ...(data as Partial<Requirements>) };
}

// ---------------------------------------------------------------------------
// Staff

export type ApplicationRow = Pick<
  MyApplication,
  "id" | "slug" | "display_name" | "headline" | "country_code" | "city" | "primary_category" | "application_status" | "application_submitted_at" | "application_decided_at" | "meeting_at" | "meeting_held_at" | "created_at"
>;

export const APPLICATION_VIEWS = {
  new: ["submitted"],
  verification: ["under_verification"],
  meeting: ["meeting_required"],
  returned: ["more_info"],
  decided: ["approved", "rejected"],
} as const;
export type ApplicationView = keyof typeof APPLICATION_VIEWS;

export async function getApplications(view: ApplicationView): Promise<{ ready: boolean; rows: ApplicationRow[]; counts: Record<ApplicationView, number> }> {
  const counts: Record<ApplicationView, number> = { new: 0, verification: 0, meeting: 0, returned: 0, decided: 0 };
  if (!hasSupabase) return { ready: false, rows: [], counts };
  const db = await serverClient();
  const { data, error } = await db
    .from("teachers")
    .select("id, slug, display_name, headline, country_code, city, primary_category, application_status, application_submitted_at, application_decided_at, meeting_at, meeting_held_at, created_at")
    .neq("application_status", "draft")
    .order("application_submitted_at", { ascending: true, nullsFirst: false })
    .limit(500);
  if (error?.code === "42703") return { ready: false, rows: [], counts };
  if (error) throw new Error(`teachers: ${error.message}`);
  const all = (data ?? []) as ApplicationRow[];
  for (const k of Object.keys(APPLICATION_VIEWS) as ApplicationView[]) counts[k] = all.filter((r) => (APPLICATION_VIEWS[k] as readonly string[]).includes(r.application_status)).length;
  let rows = all.filter((r) => (APPLICATION_VIEWS[view] as readonly string[]).includes(r.application_status));
  if (view === "decided") rows = rows.sort((a, b) => (b.application_decided_at ?? "").localeCompare(a.application_decided_at ?? "")).slice(0, 100);
  return { ready: true, rows, counts };
}

export type ApplicationEvent = { id: string; kind: string; note: string | null; actor_user_id: string | null; created_at: string };
export type ApplicationDetail = {
  app: MyApplication;
  email: string | null;
  credentials: Credential[];
  review: { meeting_outcome: string | null; meeting_notes: string | null; recorded_at: string | null } | null;
  events: ApplicationEvent[];
};

export async function getApplicationDetail(id: string): Promise<ApplicationDetail | null> {
  if (!hasSupabase || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const db = await serverClient();
  const { data, error } = await db.from("teachers").select(APPLICATION_COLS).eq("id", id).maybeSingle();
  if (error || !data) return null;
  const app = data as unknown as MyApplication;
  const [credentials, review, events, profile] = await Promise.all([
    getCredentials(id),
    db.from("application_reviews").select("meeting_outcome, meeting_notes, recorded_at").eq("teacher_id", id).maybeSingle(),
    db.from("application_events").select("id, kind, note, actor_user_id, created_at").eq("teacher_id", id).order("created_at"),
    db.from("profiles").select("email").eq("id", app.user_id).maybeSingle(),
  ]);
  return {
    app,
    email: (profile.data?.email as string | null) ?? null,
    credentials,
    review: (review.data as ApplicationDetail["review"]) ?? null,
    events: (events.data ?? []) as ApplicationEvent[],
  };
}

type Who = { id: string; slug: string; display_name: string; headline: string | null; photo_url: string | null };
export type QueuedVideo = Video & { teacher: Who | null };
export type QueuedCredential = Credential & { teacher: Who | null };
export type QueuedChange = ProfileChange & { teacher: (Who & Record<string, unknown>) | null };

/** What approved experts have waiting: videos, qualifications added after approval, and profile changes. */
export async function getProfileReviewQueue(): Promise<{ ready: boolean; videos: QueuedVideo[]; credentials: QueuedCredential[]; changes: QueuedChange[] }> {
  const empty = { ready: false, videos: [], credentials: [], changes: [] };
  if (!hasSupabase) return empty;
  const db = await serverClient();
  const who = "teacher:teachers!inner(id, slug, display_name, headline, photo_url, application_status)";
  const [videos, credentials, changes] = await Promise.all([
    db.from("teacher_videos").select(`${VIDEO_COLS}, ${who}`).in("status", ["submitted", "under_review"]).order("submitted_at"),
    db.from("teacher_credentials").select(`${CREDENTIAL_COLS}, ${who}`).eq("status", "submitted").is("deleted_at", null).eq("teacher.application_status", "approved").order("created_at"),
    db.from("teacher_profile_changes").select("*, teacher:teachers!inner(*)").eq("status", "pending").order("updated_at"),
  ]);
  if (videos.error || credentials.error || changes.error) return empty;
  return {
    ready: true,
    videos: (videos.data ?? []) as unknown as QueuedVideo[],
    credentials: (credentials.data ?? []) as unknown as QueuedCredential[],
    changes: (changes.data ?? []) as unknown as QueuedChange[],
  };
}

/** How many things wait for a reviewer, for the staff home and the navigation. */
export async function getOnboardingCounts(): Promise<{ applications: number; profile: number }> {
  if (!hasSupabase) return { applications: 0, profile: 0 };
  const db = await serverClient();
  const [a, v, c] = await Promise.all([
    db.from("teachers").select("id", { count: "exact", head: true }).in("application_status", ["submitted", "under_verification", "meeting_required"]),
    db.from("teacher_videos").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review"]),
    db.from("teacher_profile_changes").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  return { applications: a.count ?? 0, profile: (v.count ?? 0) + (c.count ?? 0) };
}
