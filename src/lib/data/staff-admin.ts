import "server-only";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";

/** Staff admin reads (S19–S25). Row-level security limits each to the right staff roles. */

export async function getGuardiansAndRequests() {
  if (!hasSupabase) return { guardians: [], checks: [], requests: [] };
  const db = await serverClient();
  const [guardians, checks, requests] = await Promise.all([
    db.from("guardians").select("id, display_name, identity_check_status, created_at, learners(id, alias, year_of_birth, consent_status)").order("created_at", { ascending: false }).limit(200),
    db.from("guardian_identity_checks").select("id, guardian_id, status, created_at, failure_reason").eq("status", "in_review").order("created_at"),
    db.from("data_requests").select("id, user_id, kind, status, note, created_at, profile:profiles!data_requests_user_id_fkey(display_name)").order("created_at", { ascending: false }).limit(100),
  ]);
  return {
    guardians: (guardians.data ?? []) as unknown as { id: string; display_name: string | null; identity_check_status: string; created_at: string; learners: { id: string; alias: string; year_of_birth: number | null; consent_status: string }[] }[],
    checks: (checks.data ?? []) as { id: string; guardian_id: string; status: string; created_at: string; failure_reason: string | null }[],
    requests: (requests.data ?? []) as unknown as { id: string; user_id: string; kind: string; status: string; note: string | null; created_at: string; profile: { display_name: string | null } | null }[],
  };
}

export async function getParameters() {
  if (!hasSupabase) return { params: [], flags: [] };
  const db = await serverClient();
  const [params, flags] = await Promise.all([
    db.from("parameters").select("id, key, track, format, mode, value, effective_from, note").order("key").order("effective_from", { ascending: false }),
    db.from("feature_flags").select("id, key, track, enabled, description").order("key"),
  ]);
  return {
    params: (params.data ?? []) as { id: string; key: string; track: string | null; format: string | null; mode: string | null; value: unknown; effective_from: string; note: string | null }[],
    flags: (flags.data ?? []) as { id: string; key: string; track: string | null; enabled: boolean; description: string | null }[],
  };
}

export async function getTemplates() {
  if (!hasSupabase) return [];
  const db = await serverClient();
  const { data } = await db.from("message_templates").select("id, key, channel, locale, subject, body, whatsapp_template_name, urgent, version, active, updated_at").order("key").order("channel");
  return (data ?? []) as { id: string; key: string; channel: string; locale: string; subject: string | null; body: string; whatsapp_template_name: string | null; urgent: boolean; version: number; active: boolean; updated_at: string }[];
}

export async function getStaff() {
  if (!hasSupabase) return [];
  const db = await serverClient();
  const { data } = await db.from("user_roles").select("user_id, role, granted_at, profile:profiles!user_roles_user_id_fkey(display_name, phone_e164, email)").in("role", ["concierge", "reviewer", "finance", "admin"]);
  const map = new Map<string, { user_id: string; name: string; contact: string; roles: string[] }>();
  for (const r of (data ?? []) as unknown as { user_id: string; role: string; profile: { display_name: string | null; phone_e164: string | null; email: string | null } | null }[]) {
    const cur = map.get(r.user_id) ?? { user_id: r.user_id, name: r.profile?.display_name ?? "—", contact: r.profile?.email ?? r.profile?.phone_e164 ?? "", roles: [] };
    cur.roles.push(r.role);
    map.set(r.user_id, cur);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getAudit(action: string | null) {
  if (!hasSupabase) return [];
  const db = await serverClient();
  let q = db.from("audit_log").select("id, actor, action, entity_type, entity_id, reason, at").order("at", { ascending: false }).limit(200);
  if (action) q = q.like("action", `${action}%`);
  const { data } = await q;
  return (data ?? []) as { id: string; actor: string; action: string; entity_type: string | null; entity_id: string | null; reason: string | null; at: string }[];
}

export async function getPilotMetrics(track: string | null) {
  if (!hasSupabase) return null;
  const db = await serverClient();
  const { data, error } = await db.rpc("pilot_metrics", { p_track: track });
  if (error) throw new Error(`pilot_metrics: ${error.message}`);
  return data as { computed_at: string; metrics: { id: string; label: string; num: number; den: number; value?: number | null; threshold: number; rule: string; note?: string }[] };
}
