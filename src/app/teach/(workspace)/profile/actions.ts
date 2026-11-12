"use server";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { COUNTRIES, normalisePhone, parseStep2, parseStep3 } from "@/domain/expert";
import { friendly } from "@/lib/db-error";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { getMyApplication } from "@/lib/data/expert";
import { removeUploads, verifyUpload } from "@/lib/expert-uploads";

export type ProfileState = { errors?: Record<string, string>; error?: string };

const NOT_CONNECTED = "Saving needs the database. Add the Supabase keys to .env.local.";

async function approvedExpert() {
  const { app } = await getMyApplication();
  if (!app) redirect("/teach/apply");
  if (app.application_status !== "approved") redirect("/teach/apply/status");
  return app;
}

/**
 * Name, title and country are what learners see and what Koobi verified, so a change waits for a
 * reviewer; the phone number and city are private and change straight away.
 */
export async function saveBasic(_: ProfileState, form: FormData): Promise<ProfileState> {
  if (!hasSupabase) return { error: NOT_CONNECTED };
  const app = await approvedExpert();
  const errors: Record<string, string> = {};
  const name = String(form.get("display_name") ?? "").trim().replace(/\s+/g, " ");
  const headline = String(form.get("headline") ?? "").trim();
  const country = String(form.get("country_code") ?? "");
  const city = String(form.get("city") ?? "").trim();
  const phone = normalisePhone(String(form.get("contact_phone") ?? ""));
  if (name.length < 5 || !name.includes(" ") || name.length > 80) errors.display_name = "Enter your full legal name, as on your ID or passport.";
  if (headline.length < 3 || headline.length > 140) errors.headline = "Enter your professional title, up to 140 characters.";
  if (!COUNTRIES.some(([c]) => c === country)) errors.country_code = "Choose your country.";
  if (city.length < 2 || city.length > 80) errors.city = "Enter the city or town you live in.";
  if (!phone) errors.contact_phone = "Enter your phone number with its country code, for example +254 712 345 678.";
  if (Object.keys(errors).length) return { errors };

  const db = await serverClient();
  const { error: privErr } = await db.from("teachers").update({ city, contact_phone: phone }).eq("id", app.id);
  if (privErr) return { error: friendly(privErr.message) };
  const { data: change, error } = await db.rpc("propose_profile_change", { p_changes: { display_name: name, headline, country_code: country } });
  if (error) return { error: friendly(error.message) };
  redirect(`/teach/profile?saved=${change ? "review" : "saved"}`);
}

export async function saveProfessional(_: ProfileState, form: FormData): Promise<ProfileState> {
  if (!hasSupabase) return { error: NOT_CONNECTED };
  const app = await approvedExpert();
  // The title and employment are not on this form; they ride along unchanged so the same rules apply.
  form.set("headline", app.headline ?? "Expert");
  form.set("employment_status", app.employment_status ?? "self_employed");
  const two = parseStep2(form);
  const three = parseStep3(form);
  const errors = { ...two.errors, ...three.errors };
  if (Object.keys(errors).length) return { errors };

  const db = await serverClient();
  const { error: privErr } = await db.from("teachers").update({ employer: two.values.employer, website_url: two.values.website_url }).eq("id", app.id);
  if (privErr) return { error: friendly(privErr.message) };
  const { data: change, error } = await db.rpc("propose_profile_change", {
    p_changes: {
      bio: two.values.bio,
      education_level: two.values.education_level,
      education_field: two.values.education_field,
      experience_band: two.values.experience_band,
      achievements: two.values.achievements,
      ...three.values,
    },
  });
  if (error) return { error: friendly(error.message) };
  redirect(`/teach/profile?saved=${change ? "review" : "saved"}`);
}

export async function withdrawChanges() {
  if (!hasSupabase) return;
  const db = await serverClient();
  await db.rpc("withdraw_profile_change");
  redirect("/teach/profile?saved=withdrawn");
}

/** The video arrived in storage: record it. Earlier uploads that were never submitted are deleted. */
export async function saveVideo(path: string, seconds: number): Promise<{ error?: string }> {
  if (!hasSupabase) return { error: NOT_CONNECTED };
  const app = await approvedExpert();
  const seen = await verifyUpload("video", app.id, path);
  if (!seen.ok) return { error: seen.error };
  const db = await serverClient();
  const { data, error } = await db.rpc("add_video", { p_storage_key: path, p_mime: seen.mime, p_size_bytes: seen.size, p_duration_seconds: Math.round(seconds) });
  if (error) {
    await removeUploads("video", [path]);
    return { error: friendly(error.message) };
  }
  const stale = ((data as { stale_keys: string[] }[] | null)?.[0]?.stale_keys ?? []).filter((k) => k !== path);
  await removeUploads("video", stale);
  return {};
}

export async function submitVideo(form: FormData) {
  if (!hasSupabase) return;
  const db = await serverClient();
  const { error } = await db.rpc("submit_video", { p_video: String(form.get("id") ?? "") });
  redirect(`/teach/profile/video?done=${error ? "error" : "submitted"}`);
}

export async function publishProfile(): Promise<ProfileState> {
  if (!hasSupabase) return { error: NOT_CONNECTED };
  const db = await serverClient();
  const { error } = await db.rpc("publish_profile");
  if (error) return { error: friendly(error.message) };
  updateTag("teachers");
  updateTag("offers");
  redirect("/teach/profile?saved=published");
}

export async function unpublishProfile() {
  if (!hasSupabase) return;
  const db = await serverClient();
  await db.rpc("unpublish_profile");
  updateTag("teachers");
  updateTag("offers");
  redirect("/teach/profile?saved=unpublished");
}
