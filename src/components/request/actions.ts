"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { REQUEST_CONSENT_VERSION, cleanEmail } from "@/domain/account";
import { normaliseKenyanPhone } from "@/domain/format";
import { BUDGETS, DAYS, FORMAT_CHOICES, TIMES, TIME_LABELS } from "@/domain/request-form";
import { categoryBySlug } from "@/domain/taxonomy";
import { brand } from "@/config/brand";
import { sendEmail } from "@/integrations/notify";
import { PREFILL_COOKIE, appOrigin, cookieOpts } from "@/lib/account";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";

export type RequestState = { error?: string; fields?: Record<string, string> };

const SENT_COOKIE = "koobi_request_sent";

/**
 * The public "Request a match" form. It works with or without an account: a signed-in person's
 * request is theirs at once; a visitor's is stored with their contact details and becomes theirs
 * when they sign up or sign in with the same email. Online only for now.
 */
export async function submitRequest(_: RequestState, form: FormData): Promise<RequestState> {
  const times = form.getAll("times").map(String).filter((t) => (TIMES as readonly string[]).includes(t));
  const days = form.getAll("days").map(String).filter((d) => DAYS.some(([v]) => v === d));
  const fields = {
    category: String(form.get("category") ?? ""),
    need: String(form.get("need") ?? "").trim(),
    format: String(form.get("format") ?? ""),
    times: times.join(","),
    days: days.join(","),
    budget: String(form.get("budget") ?? ""),
    name: String(form.get("name") ?? "").trim().slice(0, 80),
    email: String(form.get("email") ?? "").trim(),
    phone: String(form.get("phone") ?? "").trim(),
    consent: form.get("consent") === "on" ? "on" : "",
  };
  const category = categoryBySlug(fields.category);
  if (!category) return { error: "Step 1: choose what you would like to learn.", fields };
  if (fields.need.length < 10) return { error: "Step 2: tell us a little more about what you need.", fields };
  if (fields.need.length > 500) return { error: "Step 2: keep it under 500 characters; you can add detail later.", fields };
  const format = FORMAT_CHOICES.find(([v]) => v === fields.format);
  if (!format || !(BUDGETS as readonly string[]).includes(fields.budget)) return { error: "Check the options and try again.", fields };
  if (fields.name.length < 2) return { error: "Step 5: enter your full name.", fields };
  const email = cleanEmail(fields.email);
  if (!email) return { error: "Step 5: enter your email address, like amina@example.com.", fields };
  const rawPhone = fields.phone.replace(/[\s()-]/g, "");
  const phone = !rawPhone ? null : /^\+[1-9]\d{6,14}$/.test(rawPhone) ? rawPhone : normaliseKenyanPhone(fields.phone);
  if (rawPhone && !phone) return { error: "Step 5: check the phone number, like 0712 345 678, or leave it empty.", fields };
  if (!fields.consent) return { error: "Tick the box so we may contact you about this request.", fields };
  // A field people never see; only scripts fill it in. Pretend it worked.
  if (String(form.get("website") ?? "")) redirect("/request/sent");
  if (!hasSupabase) return { error: "Requests are not connected in this environment. Add the Supabase keys to send them.", fields };

  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  const { data: id, error } = await db.rpc("submit_match_request", {
    p_category: category.code,
    p_need: fields.need,
    p_format: format[0] === "unsure" ? null : format[0],
    p_times: times,
    p_days: days,
    p_budget: fields.budget ? Number(fields.budget) : null,
    p_name: fields.name,
    p_email: email,
    p_phone: phone,
    p_consent_version: REQUEST_CONSENT_VERSION,
  });
  // Before migration 20261108000200 is applied the function is missing: a signed-in person's request
  // is still saved the old way, without the new details.
  if (error?.code === "PGRST202" && auth.user) {
    const { data: created } = await db
      .from("requests")
      .insert({
        category: category.code,
        track: category.defaultTrack,
        subject: fields.need.split("\n")[0].slice(0, 80),
        goal: fields.need,
        mode: "online",
        budget_max_kes: fields.budget ? Number(fields.budget) : null,
        schedule_notes: [times.map((t) => TIME_LABELS[t]).join(", "), DAYS.filter(([v]) => days.includes(v)).map(([, l]) => l).join(", ")].filter(Boolean).join(" · ") || null,
        format_pref: format[0] === "unsure" ? null : format[0],
      })
      .select("id")
      .single();
    if (created) redirect(`/requests/${created.id}?sent=1`);
  }
  if (error || !id) {
    if (error?.message.includes("three requests today")) return { error: "You have sent three requests today. We will reply to those first.", fields };
    // Before migration 20261108000200 is applied the function is missing.
    if (error?.code === "PGRST202") return { error: "Requests without an account are being switched on. Please create an account and send it again.", fields };
    return { error: "We could not send your request. Try again in a minute.", fields };
  }
  if (auth.user) redirect(`/requests/${id}?sent=1`);

  const origin = await appOrigin();
  const first = fields.name.split(" ")[0];
  await sendEmail(
    email,
    `We have your request, ${first}`,
    [
      `Hello ${first},`,
      "",
      `Thank you for telling ${brand.name} what you want to learn:`,
      `"${fields.need.slice(0, 200)}"`,
      "",
      "A person on our team reads every request. We will email you up to three teachers or experts who fit, within 24 hours.",
      "You only pay when you book.",
      "",
      `To follow your request, create your account with this email address: ${origin}/signup?next=${encodeURIComponent(`/requests/${id}`)}`,
      "",
      `${brand.name} · ${brand.supportEmail}`,
    ].join("\n"),
  ).catch(() => null);
  const jar = await cookies();
  jar.set(SENT_COOKIE, JSON.stringify({ id, email }), cookieOpts(3600));
  jar.set(PREFILL_COOKIE, JSON.stringify({ name: fields.name, email }), cookieOpts(3600));
  redirect("/request/sent");
}
