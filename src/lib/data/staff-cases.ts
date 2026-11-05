import "server-only";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import type { DisputeRow, NoteRow, SessionRow } from "@/lib/data/lessons";

/** Staff reads for disputes (S11, S12) and refunds (S14). Row-level security limits them to staff roles. */

type BookingBits = {
  id: string;
  kind: string;
  status: string;
  starts_at: string;
  duration_minutes: number;
  price_kes: number;
  discount_kes: number;
  mode: string;
  offering: { title: string } | null;
  teacher: { display_name: string } | null;
  learner: { alias: string } | null;
};

const BOOKING_EMBED =
  "booking:bookings(id, kind, status, starts_at, duration_minutes, price_kes, discount_kes, mode, offering:offerings(title), teacher:teachers(display_name), learner:learners(alias))";

export type StaffDispute = DisputeRow & { opened_by_role: string; staff_minutes: number; booking: BookingBits | null };

export async function getDisputes(view: "open" | "decided"): Promise<StaffDispute[]> {
  if (!hasSupabase) return [];
  const db = await serverClient();
  const open = ["open", "in_review", "awaiting_party", "escalated", "reopened"];
  let q = db
    .from("disputes")
    .select(`id, booking_id, type, status, description, outcome, credit_kes, refund_kes, sla_due_at, created_at, resolved_at, evidence_snapshot, opened_by_role, staff_minutes, ${BOOKING_EMBED}`)
    .limit(100);
  q = view === "open" ? q.in("status", open).order("sla_due_at") : q.in("status", ["resolved", "closed"]).order("resolved_at", { ascending: false });
  const { data, error } = await q;
  if (error) throw new Error(`disputes: ${error.message}`);
  return (data ?? []) as unknown as StaffDispute[];
}

export type DisputeCase = {
  dispute: StaffDispute;
  session: SessionRow | null;
  note: NoteRow | null;
  payment: { id: string; platform_ref: string; method: string; amount_kes: number; status: string; hold_status: string | null } | null;
  log: { minutes: number; note: string | null; created_at: string }[];
};

export async function getDisputeCase(id: string): Promise<DisputeCase | null> {
  if (!hasSupabase || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const db = await serverClient();
  const { data, error } = await db
    .from("disputes")
    .select(`id, booking_id, type, status, description, outcome, credit_kes, refund_kes, sla_due_at, created_at, resolved_at, evidence_snapshot, opened_by_role, staff_minutes, ${BOOKING_EMBED}`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`disputes: ${error.message}`);
  const dispute = data as unknown as StaffDispute | null;
  if (!dispute) return null;
  const [session, payment, log] = await Promise.all([
    db.from("sessions").select("id, booking_id, starts_at, ends_at, status, checked_in_at, checked_out_at, actual_minutes, confirmed_at, confirmed_by").eq("booking_id", dispute.booking_id).maybeSingle(),
    db
      .from("payments")
      .select("id, platform_ref, method, amount_kes, status, hold_status")
      .eq("booking_id", dispute.booking_id)
      .in("status", ["succeeded", "refunded", "partially_refunded"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("staff_time_log").select("minutes, note, created_at").eq("subject_type", "dispute").eq("subject_id", id).order("created_at"),
  ]);
  const s = (session.data as SessionRow | null) ?? null;
  const note = s ? await db.from("lesson_notes").select("session_id, covered, progress, next_steps, filed_at").eq("session_id", s.id).maybeSingle() : null;
  return {
    dispute,
    session: s,
    note: (note?.data as NoteRow | null) ?? null,
    payment: (payment.data as DisputeCase["payment"]) ?? null,
    log: (log.data ?? []) as DisputeCase["log"],
  };
}

export type StaffRefund = {
  id: string;
  amount_kes: number;
  fee_kes: number;
  method: string;
  platform_ref: string;
  provider_ref: string | null;
  status: string;
  reason: string;
  created_at: string;
  completed_at: string | null;
  dispute_id: string | null;
  payment: { platform_ref: string; method: string; amount_kes: number } | null;
  booking: { id: string; offering: { title: string } | null } | null;
};

export async function getRefunds(view: "queue" | "sent" | "done"): Promise<StaffRefund[]> {
  if (!hasSupabase) return [];
  const db = await serverClient();
  const statuses = view === "queue" ? ["requested", "approved", "failed"] : view === "sent" ? ["pending"] : ["succeeded", "cancelled"];
  const { data, error } = await db
    .from("refunds")
    .select("id, amount_kes, fee_kes, method, platform_ref, provider_ref, status, reason, created_at, completed_at, dispute_id, payment:payments(platform_ref, method, amount_kes), booking:bookings(id, offering:offerings(title))")
    .in("status", statuses)
    .order("created_at", { ascending: view !== "done" })
    .limit(100);
  if (error) throw new Error(`refunds: ${error.message}`);
  return (data ?? []) as unknown as StaffRefund[];
}
