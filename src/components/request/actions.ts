"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { categoryBySlug } from "@/domain/taxonomy";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";

import { DRAFT_COOKIE } from "./constants";

export type RequestState = { error?: string; fields?: Record<string, string> };

const BUDGETS = ["", "1000", "2000", "5000"];
const MODES = ["online", "in_person", "either"];

export async function submitRequest(_: RequestState, form: FormData): Promise<RequestState> {
  const fields = {
    category: String(form.get("category") ?? ""),
    need: String(form.get("need") ?? "").trim(),
    mode: String(form.get("mode") ?? "either"),
    when: String(form.get("when") ?? "").trim().slice(0, 120),
    budget: String(form.get("budget") ?? ""),
    county: String(form.get("county") ?? "").trim().slice(0, 60),
  };
  const back = String(form.get("back") ?? "/request");
  const category = categoryBySlug(fields.category);
  if (!category) return { error: "Choose what you would like to learn.", fields };
  if (fields.need.length < 10) return { error: "Tell us a little more about what you need.", fields };
  if (fields.need.length > 500) return { error: "Keep it under 500 characters; you can add detail later.", fields };
  if (!MODES.includes(fields.mode) || !BUDGETS.includes(fields.budget)) return { error: "Check the options and try again.", fields };
  if (fields.mode === "in_person" && !fields.county) return { error: "Tell us the county for in-person lessons.", fields };
  if (!hasSupabase) {
    return { error: "Requests are not connected in this environment. Add the Supabase keys to send them.", fields };
  }

  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) {
    (await cookies()).set(DRAFT_COOKIE, JSON.stringify(fields), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1800,
      path: "/",
    });
    redirect(`/signin?next=${encodeURIComponent(back)}`);
  }

  const { error } = await db.from("requests").insert({
    category: category.code,
    track: category.defaultTrack,
    subject: fields.need.split("\n")[0].slice(0, 80),
    goal: fields.need,
    mode: fields.mode,
    county: fields.county || null,
    budget_max_kes: fields.budget ? Number(fields.budget) : null,
    schedule_notes: fields.when || null,
  });
  if (error) return { error: "We could not send your request. Try again in a minute.", fields };
  (await cookies()).delete(DRAFT_COOKIE);
  redirect("/home?request=sent");
}
