"use server";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { requireUser } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import { friendly } from "@/lib/db-error";
import { openGuardianDocument } from "@/lib/documents";
import { dispatchQueued } from "@/lib/notifications";

/** Staff administration (S19–S24). Each write is checked and audited again in the database. */

function to(path: string, key: "done" | "error", msg: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(msg)}`);
}

export async function reviewGuardian(form: FormData) {
  await requireUser("/staff/learners", { anyOf: ["reviewer", "admin"] });
  const db = await serverClient();
  const { error } = await db.rpc("review_guardian_check", {
    p_check: String(form.get("check_id") ?? ""),
    p_pass: form.get("decision") === "pass",
    p_note: String(form.get("note") ?? "") || null,
    p_minutes: Number(form.get("minutes")),
  });
  if (error) to("/staff/learners", "error", friendly(error.message));
  to("/staff/learners", "done", "Recorded.");
}

export async function viewGuardianDocument(form: FormData) {
  await requireUser("/staff/learners", { anyOf: ["reviewer", "admin"] });
  const r = await openGuardianDocument(String(form.get("document_id") ?? ""));
  if (!r.ok) to("/staff/learners", "error", r.error);
  redirect(r.url);
}

export async function closeDataRequest(form: FormData) {
  await requireUser("/staff/learners", { anyOf: ["admin"] });
  const db = await serverClient();
  const { error } = await db.rpc("close_data_request", { p_request: String(form.get("request_id") ?? ""), p_status: String(form.get("status") ?? ""), p_note: String(form.get("note") ?? "") || null });
  if (error) to("/staff/learners", "error", friendly(error.message));
  to("/staff/learners", "done", "Updated.");
}

export async function saveCategory(form: FormData) {
  await requireUser("/staff/taxonomy", { anyOf: ["admin"] });
  const label = String(form.get("label") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  if (label.length < 3) to("/staff/taxonomy", "error", "A category needs a name.");
  const db = await serverClient();
  const { error } = await db.from("categories").update({ label, description }).eq("code", String(form.get("code") ?? ""));
  if (error) to("/staff/taxonomy", "error", friendly(error.message));
  updateTag("taxonomy");
  updateTag("offers");
  to("/staff/taxonomy", "done", "Saved. Public pages show it within a minute.");
}

export async function toggleSubject(form: FormData) {
  await requireUser("/staff/taxonomy", { anyOf: ["admin"] });
  const db = await serverClient();
  const { error } = await db.from("subjects").update({ is_active: form.get("active") === "true" }).eq("code", String(form.get("code") ?? ""));
  if (error) to("/staff/taxonomy", "error", friendly(error.message));
  updateTag("taxonomy");
  to("/staff/taxonomy", "done", "Saved.");
}

export async function addParameter(form: FormData) {
  await requireUser("/staff/parameters", { anyOf: ["finance", "admin"] });
  let value: unknown;
  try {
    value = JSON.parse(String(form.get("value") ?? ""));
  } catch {
    to("/staff/parameters", "error", "The value must be a number, true or false, or JSON.");
  }
  const when = String(form.get("effective_from") ?? "");
  const effective = when ? new Date(`${when}:00+03:00`).toISOString() : new Date().toISOString();
  const db = await serverClient();
  const { error } = await db.rpc("add_parameter", {
    p_key: String(form.get("key") ?? ""),
    p_track: String(form.get("track") ?? ""),
    p_format: String(form.get("format") ?? ""),
    p_mode: String(form.get("mode") ?? ""),
    p_value: value,
    p_effective_from: effective,
    p_note: String(form.get("note") ?? ""),
  });
  if (error) to("/staff/parameters", "error", friendly(error.message));
  to("/staff/parameters", "done", "Scheduled. It applies from its effective time; the old value stays on record.");
}

export async function setFlag(form: FormData) {
  await requireUser("/staff/parameters", { anyOf: ["admin"] });
  const db = await serverClient();
  const { error } = await db.rpc("set_feature_flag", { p_flag: String(form.get("flag_id") ?? ""), p_enabled: form.get("enabled") === "true" });
  if (error) to("/staff/parameters", "error", friendly(error.message));
  to("/staff/parameters", "done", "Flag updated.");
}

export async function saveTemplate(form: FormData) {
  await requireUser("/staff/templates", { anyOf: ["admin"] });
  const db = await serverClient();
  const { error } = await db.rpc("update_template", {
    p_id: String(form.get("template_id") ?? ""),
    p_body: String(form.get("body") ?? ""),
    p_subject: String(form.get("subject") ?? ""),
    p_active: form.get("active") === "on",
    p_whatsapp_name: String(form.get("whatsapp_template_name") ?? ""),
  });
  if (error) to("/staff/templates", "error", friendly(error.message));
  to("/staff/templates", "done", "Saved as a new version.");
}

export async function sendQueuedNow() {
  await requireUser("/staff/templates", { anyOf: ["admin"] });
  const r = await dispatchQueued(100);
  to("/staff/templates", "done", `Sent ${r.sent}, failed ${r.failed}, held for quiet hours ${r.held}.`);
}

export async function setRole(form: FormData) {
  await requireUser("/staff/users", { anyOf: ["admin"] });
  const db = await serverClient();
  let user = String(form.get("user_id") ?? "");
  const lookup = String(form.get("lookup") ?? "").trim();
  if (!user && lookup && !/^[A-Za-z0-9@.+_-]{5,120}$/.test(lookup)) to("/staff/users", "error", "Enter a phone number or email address.");
  if (!user && lookup) {
    const phone = lookup.replace(/\s/g, "").replace(/^0/, "+254").replace(/^254/, "+254");
    const { data } = await db.from("profiles").select("id").or(`email.eq.${lookup.toLowerCase()},phone_e164.eq.${phone}`).limit(1).maybeSingle();
    if (!data) to("/staff/users", "error", "No account with that phone or email. They must sign in once first.");
    user = data!.id;
  }
  const { error } = await db.rpc("set_staff_role", { p_user: user, p_role: String(form.get("role") ?? ""), p_grant: form.get("grant") === "true" });
  if (error) to("/staff/users", "error", friendly(error.message));
  to("/staff/users", "done", "Roles updated. They take effect at the person’s next page load; staff screens still need their authenticator code.");
}
