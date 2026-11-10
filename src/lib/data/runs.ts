import "server-only";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";

/** Group classes, workshops and programmes: a run is one set of dates for a learning experience. */

export type RunSession = { id: string; sequence_no: number; starts_at: string; ends_at: string; status: string; covered: string | null; attendance: Record<string, "present" | "late" | "absent"> };
export type RunSeat = { booking_id: string; learner_alias: string; payer_first_name: string | null; status: string; paid_at: string | null; price_kes: number; hold_status: string | null };
export type MyRun = {
  id: string;
  offering_id: string;
  title: string;
  format: string;
  status: "draft" | "open" | "confirmed" | "in_progress" | "completed" | "cancelled";
  cancel_reason: string | null;
  starts_at: string;
  ends_at: string;
  cutoff_at: string;
  capacity_min: number;
  capacity_max: number;
  price_kes: number;
  duration_minutes: number;
  meeting_link: string | null;
  sessions: RunSession[];
  seats: RunSeat[];
};

/** The expert's groups, newest first. `ready` is false when the database does not have group runs yet. */
export async function getMyRuns(): Promise<{ runs: MyRun[]; ready: boolean }> {
  if (!hasSupabase) return { runs: [], ready: false };
  const db = await serverClient();
  const { data, error } = await db.rpc("my_runs");
  return error ? { runs: [], ready: false } : { runs: (data ?? []) as MyRun[], ready: true };
}

export type OpenRun = { id: string; offering_id: string; starts_at: string; ends_at: string; cutoff_at: string; price_kes: number; capacity_max: number; seats_left: number; duration_minutes: number; session_starts: string[]; status: string };

/** Dates a learner can book for one learning experience, soonest first. */
export async function getOpenRuns(offeringId: string): Promise<OpenRun[]> {
  if (!hasSupabase) return [];
  const db = await serverClient();
  const { data, error } = await db.from("offer_runs").select("id, offering_id, starts_at, ends_at, cutoff_at, price_kes, capacity_max, seats_left, duration_minutes, session_starts, status").eq("offering_id", offeringId).order("starts_at");
  return error ? [] : ((data ?? []) as OpenRun[]);
}

export type MySeat = {
  run_id: string;
  run_status: string;
  cancel_reason: string | null;
  format: string;
  meeting_link: string | null;
  sessions: { sequence_no: number; starts_at: string; ends_at: string; status: string; attendance: "present" | "late" | "absent" | null }[];
};

/** A seat-holder's view of their group; null for a booking that is not a seat. */
export async function getMySeat(bookingId: string): Promise<MySeat | null> {
  if (!hasSupabase || !/^[0-9a-f-]{36}$/.test(bookingId)) return null;
  const db = await serverClient();
  const { data, error } = await db.rpc("my_seat", { p_booking: bookingId });
  return error || !data ? null : (data as MySeat);
}

export const RUN_LABELS: Record<string, string> = {
  draft: "Draft",
  open: "Open for booking",
  confirmed: "Confirmed",
  in_progress: "Under way",
  completed: "Completed",
  cancelled: "Cancelled",
};
export const RUN_TONE: Record<string, string> = {
  draft: "bg-sand text-ink-2",
  open: "bg-fmt-1 text-orange-deep",
  confirmed: "bg-forest-tint text-forest-ink",
  in_progress: "bg-forest-tint text-forest-ink",
  completed: "bg-sand text-ink",
  cancelled: "bg-error-tint text-error",
};
