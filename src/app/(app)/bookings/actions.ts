"use server";
import { redirect } from "next/navigation";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { friendly } from "@/lib/db-error";
import { PROBLEM_TYPES } from "@/domain/booking";

/**
 * The payer's side of a lesson (PRD §3.7, §3.9): confirm, cancel, report a problem, review, ask for
 * a replacement, and take credit back to M-Pesa. Every rule is enforced in the database function.
 */

export type FormState = { error?: string };

const id = (form: FormData, key = "booking_id") => {
  const v = String(form.get(key) ?? "");
  return /^[0-9a-f-]{36}$/.test(v) ? v : null;
};

/** Where to go after an action taken from a list (My Bookings, My Schedule, a learning experience). */
const backTo = (form: FormData, fallback: string) => {
  const v = String(form.get("back") ?? "");
  return /^\/(bookings|sessions|learning)(\/[0-9a-f-]{36})?$/.test(v) ? v : fallback;
};

export async function confirmLesson(_: FormState, form: FormData): Promise<FormState> {
  const booking = id(form);
  if (!hasSupabase || !booking) return { error: "Not connected to the database." };
  const db = await serverClient();
  const { error } = await db.rpc("confirm_lesson", { p_booking: booking });
  if (error) return { error: friendly(error.message) };
  redirect(`/bookings/${booking}?done=confirmed`);
}

export async function cancelBooking(_: FormState, form: FormData): Promise<FormState> {
  const booking = id(form);
  if (!hasSupabase || !booking) return { error: "Not connected to the database." };
  const reason = String(form.get("reason") ?? "").trim().slice(0, 120);
  const db = await serverClient();
  const { data, error } = await db.rpc("cancel_booking", { p_booking: booking, p_reason: reason || null });
  if (error) return { error: friendly(error.message) };
  redirect(`${backTo(form, `/bookings/${booking}`)}?done=${data === "released" ? "cancelled-late" : data === "credited" ? "cancelled-credit" : "cancelled"}`);
}

/** Ask the expert to move a one-to-one lesson. They have six hours to accept; until then nothing changes. */
export async function askToMove(_: FormState, form: FormData): Promise<FormState> {
  const booking = id(form);
  if (!hasSupabase || !booking) return { error: "Not connected to the database." };
  const date = String(form.get("date") ?? "");
  const time = String(form.get("time") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: "Choose the new date and time." };
  const start = new Date(`${date}T${time}:00+03:00`); // Nairobi time
  if (Number.isNaN(start.getTime())) return { error: "Choose the new date and time." };
  const db = await serverClient();
  const { error } = await db.rpc("propose_reschedule", { p_booking: booking, p_new_start: start.toISOString() });
  if (error) return { error: friendly(error.message) };
  redirect(`${backTo(form, `/bookings/${booking}`)}?done=move_asked`);
}

/** Open the conversation with a booking's expert, starting one if the pair has none yet. */
export async function messageExpert(form: FormData) {
  const booking = id(form);
  const back = backTo(form, "/bookings");
  if (!hasSupabase || !booking) redirect(back);
  const db = await serverClient();
  const { data, error } = await db.rpc("open_pair_thread", { p_booking: booking });
  if (error || !data) redirect(`${back}?done=no_message`);
  redirect(`/messages/${data}`);
}

export async function reportProblem(_: FormState, form: FormData): Promise<FormState> {
  const booking = id(form);
  if (!hasSupabase || !booking) return { error: "Not connected to the database." };
  const type = String(form.get("type") ?? "");
  const description = String(form.get("description") ?? "").trim();
  if (!(type in PROBLEM_TYPES)) return { error: "Choose what went wrong." };
  if (description.length < 10) return { error: "Say what happened in a sentence or two." };
  const db = await serverClient();
  const { data, error } = await db.rpc("open_dispute", { p_booking: booking, p_type: type, p_description: description.slice(0, 2000) });
  if (error) return { error: friendly(error.message) };
  redirect(`/disputes/${data}?sent=1`);
}

export async function submitReview(_: FormState, form: FormData): Promise<FormState> {
  const booking = id(form);
  if (!hasSupabase || !booking) return { error: "Not connected to the database." };
  const rating = Number(form.get("rating"));
  const body = String(form.get("body") ?? "").trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Choose from 1 to 5 stars." };
  const db = await serverClient();
  const { error } = await db.from("reviews").insert({ booking_id: booking, rating, body: body ? body.slice(0, 2000) : null });
  if (error) return { error: error.code === "23505" ? "You have already reviewed this lesson." : friendly(error.message) };
  redirect(form.get("back") === "reviews" ? "/reviews?tab=submitted&done=reviewed" : `/bookings/${booking}?done=reviewed`);
}

export async function requestReplacement(_: FormState, form: FormData): Promise<FormState> {
  const booking = id(form);
  if (!hasSupabase || !booking) return { error: "Not connected to the database." };
  const note = String(form.get("note") ?? "").trim().slice(0, 400);
  const db = await serverClient();
  const { data, error } = await db.rpc("request_replacement", { p_booking: booking, p_note: note || null });
  if (error) return { error: friendly(error.message) };
  redirect(`/requests/${data}?sent=1`);
}

export async function requestCreditRefund(_: FormState, form: FormData): Promise<FormState> {
  const payment = id(form, "payment_id");
  if (!hasSupabase || !payment) return { error: "Not connected to the database." };
  const db = await serverClient();
  const { error } = await db.rpc("request_credit_refund", { p_payment: payment });
  if (error) return { error: friendly(error.message) };
  redirect("/account/credits?done=requested");
}
