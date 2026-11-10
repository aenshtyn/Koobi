"use server";
import { redirect } from "next/navigation";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { friendly } from "@/lib/db-error";
import { simulateSandboxPayment, startPackageCheckout, latestPackagePayment } from "@/lib/payments";
import { normaliseKenyanPhone } from "@/domain/format";

/** Packages and the monthly plan (L9, L10; FR-BOOK-6, -7). Prices and rules are applied in the database. */

export type PkgState = { error?: string };

async function learnerFor(choice: string): Promise<{ id: string } | { error: string }> {
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { error: "Sign in again." };
  if (choice !== "self") return { id: choice };
  const { data: me } = await db.from("learners").select("id").eq("user_id", auth.user.id).maybeSingle();
  if (me) return { id: me.id };
  const { data: profile } = await db.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle();
  const alias = (profile?.display_name ?? "Me").split(" ")[0].slice(0, 40) || "Me";
  await db.rpc("claim_role", { p_role: "learner" });
  const { data: created, error } = await db.from("learners").insert({ user_id: auth.user.id, alias }).select("id").single();
  return error || !created ? { error: "We could not set up your learner profile." } : { id: created.id };
}

export async function createPackage(_: PkgState, form: FormData): Promise<PkgState> {
  if (!hasSupabase) return { error: "Not connected to the database." };
  const offering = String(form.get("offering_id") ?? "");
  const sessions = Number(form.get("sessions"));
  const cadence = Number(form.get("cadence"));
  const plan = form.get("plan") === "managed" ? "managed" : "standard";
  const previous = String(form.get("previous_package_id") ?? "") || null;
  if (!Number.isInteger(sessions) || sessions < 2 || sessions > 52) return { error: "Choose how many lessons." };
  if (!Number.isInteger(cadence) || cadence < 1 || cadence > 5) return { error: "Choose lessons per week." };
  const learner = await learnerFor(String(form.get("learner") ?? "self"));
  if ("error" in learner) return { error: learner.error };
  const db = await serverClient();
  // Only the sizes on offer: the expert's own packages when there are any, otherwise the standard ones.
  const { data: listed } = await db.from("offer_details").select("package_prices").eq("id", offering).maybeSingle();
  const own = ((listed?.package_prices ?? []) as { sessions: number; name?: string }[]).filter((p) => p.name).map((p) => p.sessions);
  if (!(own.length ? own : [4, 8, 12, 16]).includes(sessions)) return { error: "Choose one of the packages on offer." };
  const { data, error } = await db
    .from("packages")
    .insert({ learner_id: learner.id, offering_id: offering, sessions_total: sessions, cadence_per_week: cadence, plan_type: plan, is_renewal: !!previous, previous_package_id: previous })
    .select("id")
    .single();
  if (error || !data) return { error: friendly(error?.message, "We could not create the package.") };
  redirect(`/packages/${data.id}`);
}

export async function payPackage(_: PkgState, form: FormData): Promise<PkgState> {
  const id = String(form.get("package_id") ?? "");
  const phone = normaliseKenyanPhone(String(form.get("phone") ?? ""));
  if (!phone) return { error: "Enter the Safaricom number that will pay, like 0712 345 678." };
  const r = await startPackageCheckout({ packageId: id, phone });
  if (!r.ok) return { error: r.error };
  redirect(`/packages/${id}?paying=1`);
}

export async function simulatePackagePayment(form: FormData) {
  const id = String(form.get("package_id") ?? "");
  const p = await latestPackagePayment(id);
  if (p) await simulateSandboxPayment(p.id, form.get("outcome") === "failure" ? "failure" : "success");
  redirect(`/packages/${id}`);
}

export async function bookFromPackage(_: PkgState, form: FormData): Promise<PkgState> {
  const id = String(form.get("package_id") ?? "");
  const slot = String(form.get("slot") ?? "");
  const mode = String(form.get("mode") ?? "online");
  if (!slot) return { error: "Choose a time." };
  const db = await serverClient();
  const { data, error } = await db.rpc("book_from_package", { p_package: id, p_starts_at: slot, p_mode: mode });
  if (error) return { error: friendly(error.message) };
  redirect(`/bookings/${data}?from=package`);
}
