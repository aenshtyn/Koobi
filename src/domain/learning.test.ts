import { describe, expect, it } from "vitest";
import { activitiesOf, experienceState, experiencesOf, groupOf, joinState, learnerStatusLabel, paymentTab, percent, type BookingView } from "./learning";

describe("learner booking groups", () => {
  it("sorts every state into one tab", () => {
    expect(groupOf("scheduled")).toBe("upcoming");
    expect(groupOf("paid")).toBe("pending");
    expect(groupOf("awaiting_confirmation")).toBe("pending");
    expect(groupOf("confirmed")).toBe("completed");
    expect(groupOf("lapsed")).toBe("cancelled");
    expect(groupOf("something_new")).toBe("pending");
  });
  it("words a confirmed place by format", () => {
    expect(learnerStatusLabel("scheduled", "one_to_one")).toBe("Confirmed");
    expect(learnerStatusLabel("scheduled", "workshop")).toBe("Registration confirmed");
    expect(learnerStatusLabel("accepted", "cohort")).toBe("Enrolled");
    expect(learnerStatusLabel("paid", "cohort")).toBe("Paid, waiting for the teacher");
  });
});

describe("join button", () => {
  const start = "2026-11-16T07:00:00Z";
  const end = "2026-11-16T08:00:00Z";
  it("opens ten minutes before the start", () => {
    const early = joinState(start, end, new Date("2026-11-16T06:49:00Z"));
    expect(early.state).toBe("early");
    expect(early.state === "early" && early.opensAt.toISOString()).toBe("2026-11-16T06:50:00.000Z");
    expect(joinState(start, end, new Date("2026-11-16T06:50:00Z")).state).toBe("open");
  });
  it("closes half an hour after the end", () => {
    expect(joinState(start, end, new Date("2026-11-16T08:30:00Z")).state).toBe("open");
    expect(joinState(start, end, new Date("2026-11-16T08:31:00Z")).state).toBe("over");
  });
});

describe("learning experience progress", () => {
  it("is upcoming, in progress or completed from what is done and what is left", () => {
    expect(experienceState({ done: 0, live: 1, remaining: 0 })).toBe("upcoming");
    expect(experienceState({ done: 2, live: 1, remaining: 0 })).toBe("in_progress");
    expect(experienceState({ done: 2, live: 0, remaining: 4 })).toBe("in_progress");
    expect(experienceState({ done: 3, live: 0, remaining: 0 })).toBe("completed");
    expect(experienceState({ done: 0, live: 0, remaining: 0 })).toBeNull();
  });
  it("gives a whole per cent and never invents one", () => {
    expect(percent(2, 6)).toBe(33);
    expect(percent(7, 6)).toBe(100);
    expect(percent(2, null)).toBe(0);
    expect(percent(0, 0)).toBe(0);
  });
});

describe("payment tabs", () => {
  it("keeps failed payments visible under their own tab", () => {
    expect(paymentTab("succeeded")).toBe("successful");
    expect(paymentTab("pending")).toBe("pending");
    expect(paymentTab("failed")).toBe("failed");
    expect(paymentTab("partially_refunded")).toBe("refunded");
    expect(paymentTab("charged_back")).toBe("failed");
  });
});

describe("My Learning and My Schedule", () => {
  const now = new Date("2026-11-10T09:00:00Z");
  const lesson = (id: string, status: string, starts_at: string, over: Partial<BookingView> = {}): BookingView => ({
    id,
    offering_id: "coaching",
    slug: "coaching",
    title: "Digital Marketing Coaching",
    teacher_name: "Brian Odhiambo",
    teacher_slug: "brian",
    teacher_headline: null,
    learner_alias: "Grace",
    status,
    starts_at,
    duration_minutes: 60,
    format: "one_to_one",
    group: groupOf(status),
    seat: null,
    when: starts_at,
    ends: new Date(new Date(starts_at).getTime() + 3600_000).toISOString(),
    ...over,
  });
  const session = (n: number, starts_at: string, attendance: "present" | "absent" | null = null) => ({
    sequence_no: n,
    starts_at,
    ends_at: new Date(new Date(starts_at).getTime() + 3600_000).toISOString(),
    status: "scheduled",
    attendance,
  });
  const programme = lesson("seat", "scheduled", "2026-11-17T07:00:00Z", {
    offering_id: "programme",
    title: "Professional Programme",
    format: "cohort",
    seat: { run_status: "confirmed", sessions: [session(1, "2026-11-03T07:00:00Z", "present"), session(2, "2026-11-17T07:00:00Z"), session(3, "2026-11-24T07:00:00Z")] },
    when: "2026-11-17T07:00:00Z",
    ends: "2026-11-17T08:00:00Z",
  });

  it("counts single lessons done without inventing a total", () => {
    const [e] = experiencesOf([lesson("a", "confirmed", "2026-11-02T07:00:00Z"), lesson("b", "scheduled", "2026-11-16T07:00:00Z")], [], now);
    expect(e).toMatchObject({ state: "in_progress", done: 1, total: null, started: "2026-11-02T07:00:00Z" });
    expect(e.next?.booking.id).toBe("b");
  });
  it("takes the total from a package and keeps it in progress while sessions are left", () => {
    const pkg = { status: "active", sessions_total: 6, sessions_used: 2, offering: { id: "coaching" } };
    const [e] = experiencesOf([lesson("a", "confirmed", "2026-11-02T07:00:00Z"), lesson("b", "confirmed", "2026-11-05T07:00:00Z")], [pkg], now);
    expect(e).toMatchObject({ state: "in_progress", done: 2, total: 6, next: null });
  });
  it("counts a programme by its sessions that have ended", () => {
    const [e] = experiencesOf([programme], [], now);
    expect(e).toMatchObject({ state: "in_progress", done: 1, total: 3, format: "cohort" });
    expect(e.next?.at).toBe("2026-11-17T07:00:00Z");
  });
  it("leaves out an experience whose only booking was cancelled, and sorts in progress first", () => {
    const list = experiencesOf([lesson("x", "cancelled", "2026-11-12T07:00:00Z", { offering_id: "gone" }), lesson("u", "scheduled", "2026-11-12T07:00:00Z", { offering_id: "new", title: "AI Tools" }), programme], [], now);
    expect(list.map((e) => [e.offering_id, e.state])).toEqual([
      ["programme", "in_progress"],
      ["new", "upcoming"],
    ]);
  });
  it("lists a lesson once and a group session by session, skipping unpaid and cancelled bookings", () => {
    const acts = activitiesOf([lesson("b", "scheduled", "2026-11-16T07:00:00Z"), lesson("c", "awaiting_payment", "2026-11-18T07:00:00Z"), lesson("d", "cancelled", "2026-11-19T07:00:00Z"), programme]);
    expect(acts.map((a) => a.key)).toEqual(["seat:1", "b", "seat:2", "seat:3"]);
    expect(acts[0]).toMatchObject({ part: { n: 1, of: 3 }, attendance: "present" });
    expect(acts[1]).toMatchObject({ part: null, ends: "2026-11-16T08:00:00.000Z" });
  });
});
