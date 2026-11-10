#!/usr/bin/env node
// Fills a NON-production Supabase project with sample records for the test accounts, so every side
// of the product has something to look at: a learner with lessons in every state, a parent with a
// child, an expert with bookings, groups, reviews and earnings, and staff desks with work waiting.
// Run:  npm run sample-data     (reads .env.local; run `npm run test-users` first)
//
// How it works: it signs in as the test accounts and takes the same steps the app takes (book, pay,
// accept, teach, note, confirm, review), with the payment provider's answer played by the secret
// key, as the sandbox does. Nothing is written around the rules, so the records are real ones.
// Lessons that should be in the past are booked ahead, taught, and then moved back.
//
// Safe to run again: each sample is made once (bookings carry "sample <key>" in their note).
// Money records cannot be deleted afterwards (the ledger is append-only), which is why this refuses
// to run without KOOBI_TEST_LOGINS=true.
import { createClient } from "@supabase/supabase-js";
import TEST_ACCOUNTS from "../src/config/test-accounts.json" with { type: "json" };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.KOOBI_TEST_PASSWORD;
const die = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
if (process.env.KOOBI_TEST_LOGINS !== "true") die("KOOBI_TEST_LOGINS is not true. Sample data is for dev and staging projects only.");
if (!url || !secret || !publishable) die("NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY must be in .env.local.");
if (!password) die("KOOBI_TEST_PASSWORD is missing. Run `npm run test-users` first.");

const POLICY = "cancellation-2026-11-v1";
const CONSENT = "parental-consent-2026-11-v1";
const MEET = "https://meet.google.com/abc-defg-hij";
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, opts);
console.log(`Target project: ${new URL(url).hostname.split(".")[0]}\n`);

/** Throws on a Supabase error, otherwise hands back the data. */
const ok = (label, { data, error }) => {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
};

async function signIn(key) {
  const account = TEST_ACCOUNTS.find((a) => a.key === key);
  const db = createClient(url, publishable, opts);
  const { data, error } = await db.auth.signInWithPassword({ email: account.email, password });
  if (error) die(`Could not sign in as ${account.email}: ${error.message}. Run \`npm run test-users\` for this project.`);
  return { db, id: data.user.id, name: account.name };
}

/** A time in Nairobi (UTC+3): `days` from today at `hour`:`min`. */
function at(days, hour, min = 0) {
  const now = new Date(Date.now() + 3 * HOUR);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, hour - 3, min));
}

let made = 0;
let skipped = 0;
let failed = 0;
/** One sample, made once. A failure is reported and the rest carry on. */
async function sample(label, exists, fn) {
  try {
    if (await exists()) {
      skipped++;
      return console.log(`• ${label}: already there`);
    }
    await fn();
    made++;
    console.log(`✓ ${label}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${label}: ${e.message}`);
  }
}

const L = await signIn("learner");
const G = await signIn("guardian");
const T = await signIn("teacher");

const teacher = ok("teacher", await admin.from("teachers").select("id, slug, display_name, listing_status, status").eq("user_id", T.id).maybeSingle());
if (!teacher) die("Test Teacher has no teaching profile yet. Sign in as the teacher, apply, and get the profile approved first.");
if (teacher.listing_status !== "approved") die("Test Teacher's profile is not approved yet. Approve it as the reviewer first.");

// ---------------------------------------------------------------------------- learning experiences
const mine = ok("offerings", await admin.from("offerings").select("id, title, slug, format, listing_status, price_hour_kes, duration_minutes").eq("teacher_id", teacher.id));
const base = mine.find((o) => o.format === "one_to_one" && o.listing_status === "approved" && !o.title.includes("(sample)"));
if (!base) die("Test Teacher needs one approved one-to-one learning experience first.");

const common = { teacher_id: teacher.id, track: "adults_professional", modes: ["online"], meeting_tool: "google_meet", language_codes: ["en"] };
const OFFERS = {
  coach: {
    ...common,
    title: "Interview coaching (sample)",
    summary: "Practise real interview questions and get plain feedback on your answers.",
    description: "We work through the questions you are most likely to be asked, record your answers, and tighten them one by one.",
    outcomes: ["Answer the five most common questions with confidence", "Talk about salary without freezing", "A short story for every skill on your CV"],
    category: "career_professional_growth",
    format: "one_to_one",
    subject_text: "Interview preparation",
    duration_minutes: 60,
    price_hour_kes: 2000,
    trial_discount_pct: 50,
  },
  group: {
    ...common,
    title: "Business conversation group class (sample)",
    summary: "Small-group speaking practice for meetings, calls and presentations.",
    description: "Two evening sessions in a small group. Everyone speaks, everyone gets feedback.",
    outcomes: ["Open and close a meeting", "Disagree politely", "Present an update in two minutes"],
    category: "career_professional_growth",
    format: "small_group",
    subject_text: "Business English",
    duration_minutes: 60,
    price_seat_kes: 1500,
    capacity_min: 1,
    capacity_max: 6,
    sessions_in_run: 2,
  },
  workshop: {
    ...common,
    title: "Spreadsheets for small business workshop (sample)",
    summary: "One morning to set up a cash book, a stock sheet and a monthly summary.",
    description: "Bring your own numbers. You leave with three working sheets you can keep using.",
    outcomes: ["A cash book that adds itself up", "A stock sheet with reorder alerts", "A one-page monthly summary"],
    category: "digital_practical_skills",
    format: "workshop",
    subject_text: "Excel",
    duration_minutes: 180,
    price_seat_kes: 3500,
    capacity_min: 1,
    capacity_max: 15,
    sessions_in_run: 1,
  },
  programme: {
    ...common,
    title: "Digital marketing programme (sample)",
    summary: "Six weekly sessions: from a clear offer to your first paid campaign.",
    description: "A practical programme for people selling a product or service. Each week ends with something published.",
    outcomes: ["A clear offer and audience", "A content plan for a month", "One small paid campaign, measured"],
    category: "business_entrepreneurship",
    format: "cohort",
    subject_text: "Digital marketing",
    duration_minutes: 90,
    price_seat_kes: 15000,
    capacity_min: 1,
    capacity_max: 12,
    sessions_in_run: 6,
  },
  school: {
    ...common,
    track: "school",
    title: "KCSE Mathematics revision (sample)",
    summary: "Past-paper practice with worked solutions, one topic a week.",
    description: "We take one topic at a time, work through past-paper questions together, and leave practice for the week.",
    outcomes: ["Quadratics and graphs", "Trigonometry", "Exam timing"],
    category: "school_academic",
    format: "one_to_one",
    subject_text: "Mathematics",
    duration_minutes: 60,
    price_hour_kes: 1500,
    trial_discount_pct: 50,
  },
  // Left waiting for the reviewer, so the staff listing queue has something in it.
  pending: {
    ...common,
    title: "Public speaking for managers (sample)",
    summary: "Speak to a room without notes: structure, voice and nerves.",
    description: "Four sessions built around one talk you need to give at work.",
    outcomes: ["A talk structure you can reuse", "A steady opening", "Handling questions"],
    category: "career_professional_growth",
    format: "one_to_one",
    subject_text: "Public speaking",
    duration_minutes: 60,
    price_hour_kes: 2200,
    trial_discount_pct: 50,
  },
};

const offer = { base };
for (const [key, row] of Object.entries(OFFERS)) {
  await sample(
    `learning experience: ${row.title}`,
    async () => {
      const found = mine.find((o) => o.title === row.title);
      if (found) offer[key] = found;
      return !!found;
    },
    async () => {
      const created = ok("insert", await admin.from("offerings").insert(row).select("id, title, slug, format, duration_minutes").single());
      ok("send for review", await admin.from("offerings").update({ listing_status: "pending_review" }).eq("id", created.id));
      if (key !== "pending") ok("approve", await admin.from("offerings").update({ listing_status: "approved" }).eq("id", created.id));
      offer[key] = created;
    },
  );
}
// One schedule per expert: the new one-to-one experiences carry the same weekly hours as the first.
const windows = ok("windows", await admin.from("availability_windows").select("kind, weekday, starts, ends").eq("offering_id", base.id).eq("kind", "weekly"));
for (const key of ["coach", "school"]) {
  if (!offer[key] || !windows.length) continue;
  const has = ok("windows", await admin.from("availability_windows").select("id").eq("offering_id", offer[key].id).limit(1));
  if (!has.length) ok("copy weekly hours", await admin.from("availability_windows").insert(windows.map((w) => ({ ...w, offering_id: offer[key].id }))));
}

// ---------------------------------------------------------------------------- the steps the app takes
let ref = 0;
const providerRef = () => `sample_${Date.now().toString(36)}_${++ref}`;

async function learnerRow(user) {
  const found = ok("learner", await user.db.from("learners").select("id").eq("user_id", user.id).maybeSingle());
  if (found) return found.id;
  const alias = (user.name ?? "Me").split(" ")[0];
  return ok("learner", await user.db.from("learners").insert({ user_id: user.id, alias }).select("id").single()).id;
}

const marker = (key) => `sample ${key}`;
const hasBooking = (user, key) => async () => {
  const rows = ok("lookup", await admin.from("bookings").select("id").eq("booked_by_user_id", user.id).like("learner_note", `%${marker(key)}`).limit(1));
  return rows.length > 0;
};

/** Books as the payer and leaves the booking waiting for payment. */
async function book(user, key, o, { kind = "single", when, learner, note, run } = {}) {
  const row = {
    offering_id: o.id,
    learner_id: learner ?? (await learnerRow(user)),
    kind: run ? "seat" : kind,
    mode: "online",
    starts_at: when.toISOString(),
    policy_version: POLICY,
    policy_acknowledged_at: new Date().toISOString(),
    learner_note: `${note ?? "Looking forward to it."} · ${marker(key)}`,
    ...(run ? { run_id: run } : {}),
  };
  const b = ok("book", await user.db.from("bookings").insert(row).select("id").single());
  ok("to checkout", await user.db.from("bookings").update({ status: "awaiting_payment" }).eq("id", b.id));
  return b.id;
}

/** The checkout: a payment for the server's amount, then the provider's answer. */
async function pay(user, target, outcome = "success") {
  const p = ok("payment", await user.db.from("payments").insert({ ...target, method: "mpesa_stk" }).select("id, amount_kes").single());
  const provider = providerRef();
  ok("stk push", await admin.rpc("mark_payment_pending", { p_payment: p.id, p_provider_ref: provider }));
  if (outcome === "failure") ok("payment failed", await admin.rpc("record_payment_failure", { p_payment: p.id, p_reason: "Sandbox: cancelled on the phone" }));
  else ok("payment confirmed", await admin.rpc("record_payment_success", { p_payment: p.id, p_provider_ref: provider, p_fee_kes: 0, p_settled_kes: null }));
  return p.id;
}

const accept = async (bookingId) => ok("accept", await T.db.rpc("teacher_respond_booking", { p_booking: bookingId, p_accept: true, p_meeting_link: MEET, p_reason: null }));
const sessionOf = async (bookingId) => ok("session", await admin.from("sessions").select("id").eq("booking_id", bookingId).single()).id;

/** Moves a lesson in time. Used to put a taught lesson where it belongs in the past. */
async function move(bookingId, start, minutes) {
  ok("move booking", await admin.from("bookings").update({ starts_at: start.toISOString() }).eq("id", bookingId));
  ok("move session", await admin.from("sessions").update({ starts_at: start.toISOString(), ends_at: new Date(start.getTime() + minutes * 60_000).toISOString() }).eq("booking_id", bookingId));
}

/** Lesson day: check in, check out and (unless left out) the note. The lesson is moved to "just started" first. */
async function teach(bookingId, minutes, note) {
  await move(bookingId, new Date(Date.now() - 5 * 60_000), minutes);
  const session = await sessionOf(bookingId);
  ok("check in", await T.db.rpc("teacher_check_in", { p_session: session }));
  ok("check out", await T.db.rpc("teacher_check_out", { p_session: session }));
  if (note) ok("lesson note", await T.db.rpc("file_lesson_note", { p_session: session, p_covered: note[0], p_progress: note[1] ?? null, p_next: note[2] ?? null }));
  return session;
}

/** After the lesson is settled, date it in the past. Dates are for looks only, so a refusal is not fatal. */
async function backdate(bookingId, start, minutes, session) {
  try {
    await move(bookingId, start, minutes);
    if (session) await admin.from("lesson_notes").update({ filed_at: new Date(start.getTime() + (minutes + 30) * 60_000).toISOString() }).eq("session_id", session);
  } catch (e) {
    console.log(`  (kept today's date: ${e.message})`);
  }
}

/** A whole lesson: booked, paid, accepted, taught with a note, then confirmed and dated `daysAgo`. */
async function taughtLesson(user, key, o, { kind, stage, daysAgo, hour, note, learner, ask, confirm = true }) {
  const id = await book(user, key, o, { kind, when: stage, learner, note: ask });
  await pay(user, { booking_id: id });
  await accept(id);
  const session = await teach(id, o.duration_minutes, note);
  if (confirm) ok("confirm", await user.db.rpc("confirm_lesson", { p_booking: id }));
  if (daysAgo) await backdate(id, at(-daysAgo, hour), o.duration_minutes, confirm ? session : null);
  return id;
}

// Lessons are first booked on far-off days nobody else uses, one hour apart, then moved.
let staged = 0;
const stage = () => at(40 + Math.floor(staged / 12), 7 + (staged++ % 12));

// ---------------------------------------------------------------------------- the learner
const coach = offer.coach ?? base;

await sample("learner: a trial lesson, completed and reviewed", hasBooking(L, "trial-reviewed"), async () => {
  const id = await taughtLesson(L, "trial-reviewed", coach, {
    kind: offer.coach ? "trial" : "single",
    stage: stage(),
    daysAgo: 21,
    hour: 10,
    ask: "I have a panel interview next month and want to practise.",
    note: ["Your two-minute introduction and the 'tell me about yourself' question.", "Clear structure. Slow down in the first thirty seconds.", "Write three short stories: a success, a failure, a disagreement."],
  });
  ok("review", await L.db.from("reviews").insert({ booking_id: id, rating: 5, body: "Practical from the first minute. I left with an introduction I can actually say out loud." }));
  ok("reply", await T.db.from("reviews").update({ teacher_reply: "Thank you. Keep practising it out loud, not in your head." }).eq("booking_id", id));
});

await sample("learner: a lesson completed two weeks ago, not yet reviewed", hasBooking(L, "done-2w"), () =>
  taughtLesson(L, "done-2w", coach, {
    stage: stage(),
    daysAgo: 14,
    hour: 10,
    note: ["Competency questions using the situation, task, action, result pattern.", "Good examples; the results need numbers.", "Add one figure to each of your three stories."],
  }),
);

await sample("learner: a lesson completed last week, not yet reviewed", hasBooking(L, "done-1w"), () =>
  taughtLesson(L, "done-1w", coach, {
    stage: stage(),
    daysAgo: 7,
    hour: 10,
    note: ["Salary questions and how to ask about the role.", "Much more relaxed than last week.", "Research the pay range for the two roles you applied for."],
  }),
);

await sample("learner: a lesson taught yesterday, waiting for the learner to confirm", hasBooking(L, "to-confirm"), () =>
  taughtLesson(L, "to-confirm", coach, {
    stage: stage(),
    daysAgo: 1,
    hour: 16,
    confirm: false,
    note: ["A full mock interview, recorded.", "Strong opening and closing. Two answers ran long.", "Watch the recording once and time each answer."],
  }),
);

await sample("learner: a lesson with a problem reported (payment on hold)", hasBooking(L, "problem"), async () => {
  const id = await taughtLesson(L, "problem", coach, { stage: stage(), daysAgo: 3, hour: 18, confirm: false, note: ["Started the presentation exercise.", null, "Finish the slides before next time."] });
  ok("report", await L.db.rpc("open_dispute", { p_booking: id, p_type: "short_session", p_description: "The lesson ended after about 25 minutes because the call kept dropping. I would like the rest of the time or part of the money back." }));
});

await sample("expert: a lesson taught today with the note still to write", hasBooking(L, "note-due"), async () => {
  const id = await book(L, "note-due", coach, { when: stage() });
  await pay(L, { booking_id: id });
  await accept(id);
  await move(id, new Date(Date.now() - 65 * 60_000), coach.duration_minutes);
  const session = await sessionOf(id);
  ok("check in", await T.db.rpc("teacher_check_in", { p_session: session }));
  ok("check out", await T.db.rpc("teacher_check_out", { p_session: session }));
});

await sample("learner: an upcoming lesson in three days (can be rescheduled)", hasBooking(L, "upcoming"), async () => {
  const id = await book(L, "upcoming", coach, { when: at(3, 10), note: "Can we focus on the technical questions this time?" });
  await pay(L, { booking_id: id });
  await accept(id);
});

await sample("learner: an upcoming lesson within 24 hours (too late to reschedule)", hasBooking(L, "soon"), async () => {
  const soon = new Date(Math.ceil((Date.now() + 20 * HOUR) / HOUR) * HOUR);
  const id = await book(L, "soon", coach, { when: soon });
  await pay(L, { booking_id: id });
  await accept(id);
});

await sample("learner: an upcoming lesson the expert has asked to move", hasBooking(L, "move-asked"), async () => {
  const id = await book(L, "move-asked", coach, { when: at(4, 15) });
  await pay(L, { booking_id: id });
  await accept(id);
  ok("ask to move", await T.db.rpc("propose_reschedule", { p_booking: id, p_new_start: at(5, 11).toISOString() }));
});

await sample("learner: a paid booking waiting for the expert's answer", hasBooking(L, "to-answer"), async () => {
  const id = await book(L, "to-answer", coach, { when: at(5, 14), note: "First time here. Evenings also work if this slot goes." });
  await pay(L, { booking_id: id });
});

await sample("learner: a booking whose payment failed (nothing charged)", hasBooking(L, "pay-failed"), async () => {
  const id = await book(L, "pay-failed", coach, { when: at(6, 11) });
  await pay(L, { booking_id: id }, "failure");
});

await sample("learner: a booking cancelled in time, credit asked back to M-Pesa", hasBooking(L, "refund"), async () => {
  const id = await book(L, "refund", coach, { when: at(8, 15) });
  const payment = await pay(L, { booking_id: id });
  await accept(id);
  ok("cancel", await L.db.rpc("cancel_booking", { p_booking: id, p_reason: "Travelling that week" }));
  ok("ask for refund", await L.db.rpc("request_credit_refund", { p_payment: payment }));
});

// ---- a package on the expert's first learning experience
await sample(
  "learner: a package of 8 lessons, two done and one booked",
  async () => ok("lookup", await admin.from("packages").select("id").eq("booked_by_user_id", L.id).eq("offering_id", base.id).limit(1)).length > 0,
  async () => {
    const learner = await learnerRow(L);
    const pkg = ok("package", await L.db.from("packages").insert({ learner_id: learner, offering_id: base.id, sessions_total: 8, cadence_per_week: 2 }).select("id").single());
    await pay(L, { package_id: pkg.id });
    const lesson = async (when) => ok("book from package", await L.db.rpc("book_from_package", { p_package: pkg.id, p_starts_at: when.toISOString(), p_mode: "online" }));
    for (const [daysAgo, note] of [
      [10, ["Email structure: purpose first, then detail.", "Clear writing. Subject lines need work.", "Rewrite three emails you sent this week."]],
      [4, ["Speaking up in meetings: agreeing, disagreeing, asking for time.", "More confident. Uses the phrases naturally.", "Use two of the phrases in a real meeting."]],
    ]) {
      const id = await lesson(stage());
      await accept(id);
      const session = await teach(id, base.duration_minutes, note);
      ok("confirm", await L.db.rpc("confirm_lesson", { p_booking: id }));
      await backdate(id, at(-daysAgo, 17), base.duration_minutes, session);
    }
    await accept(await lesson(at(2, 17)));
  },
);

// ---- seats in a programme, a workshop and a group class
async function seat(key, o, first, after) {
  await sample(`learner: a seat in ${o.title}`, hasBooking(L, key), async () => {
    const run = ok("add dates", await T.db.rpc("create_run", { p_offering: o.id, p_first_start: first.toISOString() }));
    ok("meeting link", await T.db.rpc("set_run_link", { p_run: run, p_link: "https://meet.google.com/grp-abcd-efg" }));
    const id = await book(L, key, o, { when: first, run });
    await pay(L, { booking_id: id });
    if (after) await after(run, id);
  });
}

if (offer.programme) {
  // Under way: every date is moved back a week, so the first session has happened and is marked.
  await seat("programme", offer.programme, at(2, 18), async (run, seatId) => {
    ok("confirm the group", await T.db.rpc("confirm_run", { p_run: run }));
    const r = ok("run", await admin.from("runs").select("starts_at, ends_at, cutoff_at").eq("id", run).single());
    const back = (iso) => new Date(new Date(iso).getTime() - 7 * DAY).toISOString();
    ok("move run", await admin.from("runs").update({ starts_at: back(r.starts_at), ends_at: back(r.ends_at), cutoff_at: back(r.cutoff_at) }).eq("id", run));
    const sessions = ok("sessions", await admin.from("sessions").select("id, sequence_no, starts_at, ends_at").or(`run_id.eq.${run},booking_id.eq.${seatId}`).order("starts_at"));
    for (const s of sessions) ok("move session", await admin.from("sessions").update({ starts_at: back(s.starts_at), ends_at: back(s.ends_at) }).eq("id", s.id));
    const first = sessions.find((s) => s.sequence_no === 1) ?? sessions[0];
    ok(
      "mark session 1",
      await T.db.rpc("mark_run_session", { p_session: first.id, p_attendance: { [seatId]: "present" }, p_covered: "Your offer in one sentence, and who it is for.", p_progress: null, p_next: "Write your offer and send it to three people for a reaction." }),
    );
  });
}
if (offer.workshop) await seat("workshop", offer.workshop, at(9, 9));
if (offer.group) await seat("group", offer.group, at(4, 18));

// ---- following and a few messages
await sample(
  "learner: follows the expert",
  async () => {
    const { data, error } = await L.db.rpc("my_following");
    if (error) throw new Error("the database does not have following yet (push migration 20261106001800 first)");
    return data.some((f) => f.slug === teacher.slug);
  },
  async () => ok("follow", await L.db.rpc("follow_teacher", { p_slug: teacher.slug })),
);

let threadId = null;
await sample(
  "learner and expert: a short conversation",
  async () => {
    const threads = ok("threads", await L.db.rpc("my_threads"));
    const thread = threads.find((t) => t.my_role === "payer" && t.other_name === teacher.display_name);
    if (!thread) throw new Error("no conversation between them yet (it opens from a shortlist, or from a paid booking once migration 20261106001800 is pushed)");
    const said = ok("messages", await admin.from("messages").select("id").eq("thread_id", thread.id).like("body", "%the technical questions%").limit(1));
    threadId = thread.id;
    return said.length > 0;
  },
  async () => {
    const say = async (who, body) => ok("message", await who.db.from("messages").insert({ thread_id: threadId, body }));
    await say(L, "Hello! For Thursday, could we spend most of the hour on the technical questions?");
    await say(T, "Yes, good idea. Send me the job advert and I will prepare questions from it.");
    await say(L, "Sending it tonight. Thank you!");
  },
);

// ---------------------------------------------------------------------------- the parent
const kids = offer.school ?? coach;
let child = null;
await sample(
  "parent: a child added with consent",
  async () => {
    const guardian = ok("guardian", await admin.from("guardians").select("id").eq("user_id", G.id).maybeSingle());
    if (!guardian) return false;
    const found = ok("children", await admin.from("learners").select("id").eq("guardian_id", guardian.id).limit(1));
    child = found[0]?.id ?? null;
    return !!child;
  },
  async () => {
    ok("parent account", await G.db.rpc("become_guardian", { p_display_name: "Test Parent" }));
    child = ok("add child", await G.db.rpc("add_child", { p_alias: "Amani", p_year_of_birth: new Date().getFullYear() - 15, p_curriculum: null, p_level: null, p_language: "en", p_needs: [], p_consent_version: CONSENT }));
  },
);
if (child) {
  await sample("parent: a lesson for the child, completed with a note", hasBooking(G, "child-done"), () =>
    taughtLesson(G, "child-done", kids, {
      kind: offer.school ? "trial" : "single",
      learner: child,
      stage: stage(),
      daysAgo: 6,
      hour: 16,
      ask: "Amani finds quadratics hard and has a test in three weeks.",
      note: ["Factorising quadratics and the quadratic formula.", "Gets the method. Slips on signs when rushing.", "Ten past-paper questions, checked against the worked answers."],
    }),
  );
  await sample("parent: an upcoming lesson for the child", hasBooking(G, "child-upcoming"), async () => {
    const id = await book(G, "child-upcoming", kids, { when: at(3, 16), learner: child });
    await pay(G, { booking_id: id });
    await accept(id);
  });
}
await sample(
  "parent: a request for a match, waiting for the concierge",
  async () => ok("lookup", await admin.from("requests").select("id").eq("requester_id", G.id).like("goal", "%sample request%").limit(1)).length > 0,
  async () =>
    ok(
      "request",
      await G.db.from("requests").insert({
        category: "school_academic",
        track: "school",
        subject: "KCSE Chemistry revision",
        goal: "KCSE Chemistry revision\nMy daughter is in Form 4 and needs help with the mole concept and organic chemistry before the mocks. (sample request)",
        mode: "online",
        budget_max_kes: 1500,
        schedule_notes: "Weekday evenings after 5, or Saturday mornings",
      }),
    ),
);

// ---------------------------------------------------------------------------- what to look at
console.log(`\n${made} made, ${skipped} already there, ${failed} failed.\n`);
console.log("Sign in at /signin/test and look at:");
console.log("  Learner            /home  /learning  /bookings  /sessions  /payments  /reviews  /messages  /following");
console.log("  Parent or guardian /home  /bookings  /account/learners  and the request on /home");
console.log("  Teacher or expert  /teach  /teach/bookings  /teach/runs  /teach/earnings  /teach/reviews  /teach/messages");
console.log("  Concierge          /staff/requests  /staff/disputes");
console.log("  Reviewer           /staff/listings");
console.log("  Finance            /staff/refunds  /staff/ledger");
console.log("  Admin              /staff and everything above");
console.log("\nSome samples age: a paid booking the expert does not answer goes back as credit after 12 hours, a request to move a lesson lasts 6 hours, and a taught lesson is confirmed by itself after 48 hours.");
if (failed) process.exit(1);
