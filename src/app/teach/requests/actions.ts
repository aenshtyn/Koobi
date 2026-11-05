"use server";
import { redirect } from "next/navigation";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { getMyOffers, getMyTeacher } from "@/lib/data/listings";
import { getTeacherInbox } from "@/lib/data/matching";
import { PRICE_BANDS } from "@/domain/listing-input";
import { PITCH_MAX } from "@/domain/matching";
import { formatKES } from "@/domain/format";

export type ApplyState = { error?: string; values?: Record<string, string> };

export async function applyToRequest(_: ApplyState, form: FormData): Promise<ApplyState> {
  if (!hasSupabase) return { error: "Not connected to the database." };
  const values = { offering_id: String(form.get("offering_id") ?? ""), pitch: String(form.get("pitch") ?? "").trim(), price: String(form.get("price") ?? "") };
  const requestId = String(form.get("request_id") ?? "");
  const [teacher, inbox] = await Promise.all([getMyTeacher(), getTeacherInbox()]);
  const open = inbox.find((r) => r.id === requestId);
  if (!teacher || !open) return { error: "This request is no longer open.", values };
  if (!open.offering_ids.includes(values.offering_id)) return { error: "Choose one of your offers that fits this request.", values };
  if (values.pitch.length < 20) return { error: "Say in a sentence or two why you are a good fit.", values };
  if (values.pitch.length > PITCH_MAX) return { error: `Keep the pitch under ${PITCH_MAX} characters.`, values };
  const offer = (await getMyOffers(teacher.id)).find((o) => o.id === values.offering_id);
  const price = Number(values.price.replace(/[,\s]/g, ""));
  const band = PRICE_BANDS[(offer?.track ?? "adults_professional") as keyof typeof PRICE_BANDS];
  if (!Number.isInteger(price) || price < band.min || price > band.max) {
    return { error: `Price per hour must be between ${formatKES(band.min)} and ${formatKES(band.max)}.`, values };
  }
  const db = await serverClient();
  const { error } = await db
    .from("teacher_applications")
    .insert({ request_id: requestId, teacher_id: teacher.id, offering_id: values.offering_id, pitch: values.pitch, proposed_price_kes: price });
  if (error) return { error: error.code === "23505" ? "You have already applied with this offer." : error.message, values };
  redirect("/teach/requests?applied=1");
}
