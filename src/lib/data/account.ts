import "server-only";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";

/** Account reads (X1, L9, L10, L19–L21, L26). Row-level security returns the caller's own rows. */

export type InApp = { id: string; template: string; payload: Record<string, unknown>; created_at: string; read_at: string | null };

export async function getNotifications(): Promise<{ items: InApp[]; templates: Record<string, string>; timeZone: string }> {
  if (!hasSupabase) return { items: [], templates: {}, timeZone: "Africa/Nairobi" };
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { items: [], templates: {}, timeZone: "Africa/Nairobi" };
  const [items, templates, profile] = await Promise.all([
    db.from("notifications").select("id, template, payload, created_at, read_at").eq("user_id", auth.user.id).eq("channel", "in_app").order("created_at", { ascending: false }).limit(100),
    db.from("message_templates").select("key, body").eq("channel", "in_app").eq("locale", "en"),
    db.from("profiles").select("time_zone").eq("id", auth.user.id).maybeSingle(),
  ]);
  return {
    items: (items.data ?? []) as InApp[],
    templates: Object.fromEntries(((templates.data ?? []) as { key: string; body: string }[]).map((t) => [t.key, t.body])),
    timeZone: (profile.data?.time_zone as string | undefined) ?? "Africa/Nairobi",
  };
}

export async function getUnreadCount(): Promise<number> {
  if (!hasSupabase) return 0;
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return 0;
  const { count } = await db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", auth.user.id).eq("channel", "in_app").is("read_at", null);
  return count ?? 0;
}

export type Child = { id: string; alias: string; year_of_birth: number | null; level_code: string | null; curriculum_code: string | null; consent_status: string; created_at: string };

export async function getGuardian(): Promise<{ guardian: { id: string; display_name: string | null; identity_check_status: string } | null; children: Child[]; check: { id: string; status: string; failure_reason: string | null } | null }> {
  if (!hasSupabase) return { guardian: null, children: [], check: null };
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { guardian: null, children: [], check: null };
  const { data: guardian } = await db.from("guardians").select("id, display_name, identity_check_status").eq("user_id", auth.user.id).maybeSingle();
  if (!guardian) return { guardian: null, children: [], check: null };
  const [children, check] = await Promise.all([
    db.from("learners").select("id, alias, year_of_birth, level_code, curriculum_code, consent_status, created_at").eq("guardian_id", guardian.id).order("created_at"),
    db.from("guardian_identity_checks").select("id, status, failure_reason").eq("guardian_id", guardian.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return { guardian, children: (children.data ?? []) as Child[], check: (check.data as { id: string; status: string; failure_reason: string | null } | null) ?? null };
}

export type Prefs = { whatsapp_opt_in: boolean; sms_enabled: boolean; email_enabled: boolean; marketing_opt_in: boolean };

export async function getSettings(): Promise<{ profile: { display_name: string | null; email: string | null; phone_e164: string | null; locale: string; time_zone: string } | null; prefs: Prefs; requests: { id: string; kind: string; status: string; note: string | null; created_at: string }[] }> {
  const prefs: Prefs = { whatsapp_opt_in: false, sms_enabled: true, email_enabled: true, marketing_opt_in: false };
  if (!hasSupabase) return { profile: null, prefs, requests: [] };
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { profile: null, prefs, requests: [] };
  const [profile, p, requests] = await Promise.all([
    db.from("profiles").select("display_name, email, phone_e164, locale, time_zone").eq("id", auth.user.id).maybeSingle(),
    db.from("notification_preferences").select("whatsapp_opt_in, sms_enabled, email_enabled, marketing_opt_in").eq("user_id", auth.user.id).maybeSingle(),
    db.from("data_requests").select("id, kind, status, note, created_at").eq("user_id", auth.user.id).order("created_at", { ascending: false }),
  ]);
  return {
    profile: profile.data as { display_name: string | null; email: string | null; phone_e164: string | null; locale: string; time_zone: string } | null,
    prefs: (p.data as Prefs | null) ?? prefs,
    requests: (requests.data ?? []) as { id: string; kind: string; status: string; note: string | null; created_at: string }[],
  };
}

export type PackageRow = {
  id: string;
  plan_type: string;
  sessions_total: number;
  sessions_used: number;
  price_kes: number;
  starts_on: string;
  ends_on: string | null;
  cadence_per_week: number;
  status: string;
  is_renewal: boolean;
  learner_id: string;
  offering: { id: string; slug: string; title: string; modes: string[]; duration_minutes: number } | null;
  teacher: { display_name: string } | null;
  learner: { alias: string } | null;
};

// Parents cannot read offerings or teachers directly; the public offer view has what the screen needs.
const PKG_COLS = "id, plan_type, sessions_total, sessions_used, price_kes, starts_on, ends_on, cadence_per_week, status, is_renewal, learner_id, offering_id, learner:learners(alias)";

type PkgRaw = Omit<PackageRow, "offering" | "teacher"> & { offering_id: string };

async function withOffers(rows: PkgRaw[]): Promise<PackageRow[]> {
  if (!rows.length) return [];
  const db = await serverClient();
  const { data } = await db
    .from("explore_offers")
    .select("id, slug, title, modes, duration_minutes, teacher_name")
    .in("id", [...new Set(rows.map((r) => r.offering_id))]);
  const offers = (data ?? []) as { id: string; slug: string; title: string; modes: string[]; duration_minutes: number; teacher_name: string }[];
  return rows.map(({ offering_id, ...r }) => {
    const o = offers.find((x) => x.id === offering_id);
    return {
      ...r,
      offering: o ? { id: o.id, slug: o.slug, title: o.title, modes: o.modes, duration_minutes: o.duration_minutes } : null,
      teacher: o ? { display_name: o.teacher_name } : null,
    };
  });
}

export async function getMyPackages(): Promise<PackageRow[]> {
  if (!hasSupabase) return [];
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return [];
  const { data } = await db.from("packages").select(PKG_COLS).eq("booked_by_user_id", auth.user.id).order("created_at", { ascending: false });
  return withOffers((data ?? []) as unknown as PkgRaw[]);
}

export async function getMyPackage(id: string): Promise<{ pkg: PackageRow; lessons: { id: string; status: string; starts_at: string }[] } | null> {
  if (!hasSupabase || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const db = await serverClient();
  const { data } = await db.from("packages").select(PKG_COLS).eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: lessons } = await db.from("bookings").select("id, status, starts_at").eq("package_id", id).order("starts_at");
  const [pkg] = await withOffers([data as unknown as PkgRaw]);
  return { pkg, lessons: (lessons ?? []) as { id: string; status: string; starts_at: string }[] };
}
