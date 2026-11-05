"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { getConsole } from "@/lib/data/matching";
import { rankCandidates, snapshot } from "@/domain/matching";

export type ConsoleState = { error?: string };

/**
 * Sends the shortlist through public.send_shortlist, which triages, logs the minutes, creates the
 * matches and moves the request in one transaction. The ranking snapshot is recomputed here from
 * stored data, never taken from the browser.
 */
export async function sendShortlist(_: ConsoleState, form: FormData): Promise<ConsoleState> {
  if (!hasSupabase) return { error: "Not connected to the database." };
  const id = String(form.get("request_id") ?? "");
  await requireUser(`/staff/requests/${id}`, { anyOf: ["concierge", "admin"] });
  const minutes = Number(form.get("minutes"));
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return { error: "Log the minutes you spent on this request (1 to 1440)." };

  const view = await getConsole(id);
  if (!view) return { error: "Request not found." };
  const ranked = rankCandidates(view.request, view.candidates);
  const chosen = form.getAll("pick").map(String);
  if (!chosen.length) return { error: "Choose at least one teacher or expert." };
  if (chosen.length > 5) return { error: "A shortlist has at most 5: 3 main and 2 in reserve." };

  const items = [];
  for (const offeringId of chosen) {
    const c = ranked.find((r) => r.offering_id === offeringId);
    if (!c) return { error: "One of the chosen offers is no longer available. Refresh the page." };
    const rank = Number(form.get(`rank-${offeringId}`));
    const reason = String(form.get(`reason-${offeringId}`) ?? "").trim();
    if (!reason) return { error: `Add a one-line reason for ${c.teacher_name}; the learner sees it.` };
    items.push({ offering_id: offeringId, rank, reason: reason.slice(0, 200), source: c.applied ? "teacher_applied" : "concierge", snapshot: snapshot(c) });
  }
  const ranks = items.map((i) => i.rank);
  if (ranks.some((r) => !Number.isInteger(r) || r < 1 || r > 5) || new Set(ranks).size !== ranks.length) {
    return { error: "Give each chosen teacher a different position, 1 to 5." };
  }

  const db = await serverClient();
  const { error } = await db.rpc("send_shortlist", { p_request: id, p_minutes: minutes, p_note: String(form.get("note") ?? ""), p_items: items });
  if (error) return { error: error.message };
  redirect(`/staff/requests/${id}?sent=1`);
}

export async function markUnmatched(_: ConsoleState, form: FormData): Promise<ConsoleState> {
  if (!hasSupabase) return { error: "Not connected to the database." };
  const id = String(form.get("request_id") ?? "");
  await requireUser(`/staff/requests/${id}`, { anyOf: ["concierge", "admin"] });
  const reason = String(form.get("reason") ?? "").trim();
  const minutes = Number(form.get("minutes"));
  if (reason.length < 10) return { error: "Say why no one fits (at least 10 characters); it feeds the supply plan." };
  if (!Number.isInteger(minutes) || minutes < 1) return { error: "Log the minutes you spent." };
  const db = await serverClient();
  const { data: r } = await db.from("requests").select("status").eq("id", id).maybeSingle();
  if (!r) return { error: "Request not found." };
  if (r.status === "submitted") {
    const { error } = await db.from("requests").update({ status: "triaged" }).eq("id", id);
    if (error) return { error: error.message };
  }
  const { error: logErr } = await db.from("staff_time_log").insert({ subject_type: "request", subject_id: id, minutes, note: `Unmatched: ${reason}` });
  if (logErr) return { error: logErr.message };
  const { error } = await db.from("requests").update({ status: "unmatched" }).eq("id", id);
  if (error) return { error: error.message };
  redirect(`/staff/requests/${id}`);
}
