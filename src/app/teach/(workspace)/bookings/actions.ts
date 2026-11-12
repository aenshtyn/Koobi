"use server";
import { redirect } from "next/navigation";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { isAllowedMeetingLink } from "@/domain/booking";

export type RespondState = { error?: string };

export async function respondToBooking(_: RespondState, form: FormData): Promise<RespondState> {
  if (!hasSupabase) return { error: "Not connected to the database." };
  const id = String(form.get("booking_id") ?? "");
  const accept = form.get("decision") === "accept";
  const link = String(form.get("meeting_link") ?? "").trim();
  const reason = String(form.get("reason") ?? "").trim();
  const online = form.get("mode") === "online";
  if (accept && online && !isAllowedMeetingLink(link)) return { error: "Paste a Google Meet or Zoom link, starting with https://." };
  if (!accept && reason.length < 5) return { error: "Tell the learner briefly why you cannot take it." };
  const db = await serverClient();
  const { error } = await db.rpc("teacher_respond_booking", {
    p_booking: id,
    p_accept: accept,
    p_meeting_link: accept && online ? link : null,
    p_reason: accept ? null : reason,
  });
  if (error) return { error: error.message };
  redirect(`/teach/bookings/${id}?done=${accept ? "accepted" : "declined"}`);
}
