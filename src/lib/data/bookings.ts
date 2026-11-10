import "server-only";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";

export type MyBooking = {
  id: string;
  offering_id: string;
  slug: string;
  title: string;
  teacher_name: string;
  kind: string;
  mode: string;
  starts_at: string;
  duration_minutes: number;
  price_kes: number;
  discount_kes: number;
  status: string;
  paid_at: string | null;
  accepted_at: string | null;
  meeting_link: string | null;
  learner_alias: string;
  policy_version: string | null;
  created_at: string;
  learner_id: string;
};

export type TeachingBooking = Omit<MyBooking, "slug" | "teacher_name" | "accepted_at" | "policy_version" | "learner_id"> & { payer_first_name: string | null };

export async function getMyBookings(): Promise<MyBooking[]> {
  if (!hasSupabase) return [];
  const db = await serverClient();
  const { data, error } = await db.rpc("my_bookings");
  if (error) throw new Error(`my_bookings: ${error.message}`);
  return (data ?? []) as MyBooking[];
}

export async function getMyBooking(id: string): Promise<MyBooking | null> {
  return (await getMyBookings()).find((b) => b.id === id) ?? null;
}

export async function getTeachingBookings(): Promise<TeachingBooking[]> {
  if (!hasSupabase) return [];
  const db = await serverClient();
  const { data, error } = await db.rpc("my_teaching_bookings");
  if (error) throw new Error(`my_teaching_bookings: ${error.message}`);
  return (data ?? []) as TeachingBooking[];
}

export type Reschedule = { id: string; by_role: "teacher" | "payer"; new_starts_at: string; expires_at: string };

export type TeachingBookingDetails = {
  learner_note: string | null;
  internal_note: string | null;
  payer_phone: string | null;
  for_child: boolean;
  payment: { method: string; reference: string; paid_at: string | null; hold_status: string | null } | null;
  by_credit: boolean;
  reschedule: Reschedule | null;
  moved_from: string | null;
};

/** The rest of the expert's booking view. Null when it cannot be read (or the database function is not there yet). */
export async function getTeachingBookingDetails(id: string): Promise<TeachingBookingDetails | null> {
  if (!hasSupabase || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const db = await serverClient();
  const { data, error } = await db.rpc("teaching_booking_details", { p_booking: id });
  return error || !data ? null : (data as TeachingBookingDetails);
}

/** An open request to move a booking, for either side of it. */
export async function getOpenReschedule(bookingId: string): Promise<Reschedule | null> {
  if (!hasSupabase || !/^[0-9a-f-]{36}$/.test(bookingId)) return null;
  const db = await serverClient();
  const { data, error } = await db
    .from("booking_reschedules")
    .select("id, by_role, new_starts_at, expires_at")
    .eq("booking_id", bookingId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return error || !data ? null : (data as Reschedule);
}

export type MyPayment = {
  id: string;
  booking_id: string | null;
  platform_ref: string;
  method: string;
  amount_kes: number;
  status: string;
  failure_reason: string | null;
  created_at: string;
  succeeded_at: string | null;
};

export async function getMyPayments(): Promise<MyPayment[]> {
  if (!hasSupabase) return [];
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return [];
  const { data, error } = await db
    .from("payments")
    .select("id, booking_id, platform_ref, method, amount_kes, status, failure_reason, created_at, succeeded_at")
    .eq("payer_user_id", auth.user.id)
    .in("status", ["succeeded", "failed", "refunded", "partially_refunded"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(`payments: ${error.message}`);
  return (data ?? []) as MyPayment[];
}

export async function getPolicyText(version: string): Promise<string | null> {
  if (!hasSupabase) return null;
  const db = await serverClient();
  const { data } = await db.from("policy_versions").select("body").eq("version", version).maybeSingle();
  return (data?.body as string | undefined) ?? null;
}
