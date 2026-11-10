"use server";
import { redirect } from "next/navigation";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { bookableSlots, CANCELLATION_POLICY_VERSION } from "@/domain/booking";

export type BookState = { error?: string };

export async function createBooking(_: BookState, form: FormData): Promise<BookState> {
  if (!hasSupabase) return { error: "Booking needs the database." };
  const slug = String(form.get("slug") ?? "");
  let kind = form.get("kind") === "trial" ? "trial" : "single";
  const slot = String(form.get("slot") ?? "");
  const learnerChoice = String(form.get("learner") ?? "self");
  const mode = String(form.get("mode") ?? "");
  if (form.get("ack") !== "on") return { error: "Please confirm you have read the cancellation terms." };

  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect(`/signin?next=/book/${slug}`);

  // Fresh, uncached reads: the slot must still be free now.
  const [{ data: offer }, { data: details }] = await Promise.all([
    db.from("explore_offers").select("id, modes, format").eq("slug", slug).maybeSingle(),
    db.from("offer_details").select("next_slots, trial_price_kes").eq("slug", slug).maybeSingle(),
  ]);
  if (!offer || !details) return { error: "This learning experience is not open for booking right now." };
  // A group is booked by its dates: the "slot" is the run, and the booking is a seat on it.
  let run: { id: string; starts_at: string } | null = null;
  if (offer.format !== "one_to_one") {
    const { data: open } = await db.from("offer_runs").select("id, starts_at").eq("offering_id", offer.id).eq("id", /^[0-9a-f-]{36}$/.test(slot) ? slot : "00000000-0000-0000-0000-000000000000").maybeSingle();
    if (!open) return { error: "Those dates are full or no longer open. Choose others." };
    run = open as { id: string; starts_at: string };
    kind = "seat";
  } else {
    if (!bookableSlots(details.next_slots ?? [], new Date()).includes(slot)) return { error: "That time was just taken. Choose another." };
    if (kind === "trial" && !details.trial_price_kes) return { error: "This learning experience has no trial lesson." };
  }
  const modes = (offer.modes as string[]).filter((m) => m !== "hybrid");
  const bookingMode = modes.includes(mode) ? mode : modes[0];

  let learnerId = learnerChoice;
  if (learnerChoice === "self") {
    const { data: me } = await db.from("learners").select("id").eq("user_id", auth.user.id).maybeSingle();
    if (me) learnerId = me.id;
    else {
      const { data: profile } = await db.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle();
      const alias = ((profile?.display_name as string | null) ?? "Me").split(" ")[0].slice(0, 40) || "Me";
      const { data: created, error } = await db.from("learners").insert({ user_id: auth.user.id, alias }).select("id").single();
      if (error || !created) return { error: "We could not set up your learner profile. Try again." };
      learnerId = created.id;
    }
  }

  // One open checkout per offer: earlier unpaid attempts free their slot.
  await db
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("booked_by_user_id", auth.user.id)
    .eq("offering_id", offer.id)
    .in("status", ["requested", "awaiting_payment"]);

  const row: Record<string, unknown> = {
    offering_id: offer.id,
    learner_id: learnerId,
    kind,
    mode: bookingMode,
    starts_at: run ? run.starts_at : slot,
    ...(run ? { run_id: run.id } : {}),
    policy_version: CANCELLATION_POLICY_VERSION,
    policy_acknowledged_at: new Date().toISOString(),
  };
  const note = String(form.get("learner_note") ?? "").trim().slice(0, 500);
  let { data: booking, error } = await db.from("bookings").insert(note ? { ...row, learner_note: note } : row).select("id").single();
  // A database that does not have the note column yet still takes the booking.
  if (error && note && /learner_note/.test(error.message)) ({ data: booking, error } = await db.from("bookings").insert(row).select("id").single());
  if (error || !booking) return { error: error?.message ?? "We could not hold that time. Try again." };
  redirect(`/checkout/${booking.id}/pay`);
}
