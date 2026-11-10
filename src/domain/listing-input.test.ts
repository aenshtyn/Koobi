import { describe, expect, it } from "vitest";
import { blocksSubmission, parseOfferForm, parseTeacherForm, parseWindow, sessionPrice, stepOfField } from "./listing-input";

function form(entries: [string, string][]) {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

const goodOffer: [string, string][] = [
  ["title", "Business English for professionals"],
  ["category", "career_professional_growth"],
  ["summary", "Emails, meetings and presentations that land."],
  ["subject_text", "Business English"],
  ["outcomes", "- Emails that get read\n• Leading meetings\n\n"],
  ["modes", "online"],
  ["meeting_tool", "google_meet"],
  ["duration_minutes", "50"],
  ["price_hour_kes", "1,800"],
  ["trial", "on"],
  ["language_codes", "en"],
];

describe("offer form", () => {
  it("accepts a complete one-to-one offer and derives the track", () => {
    const r = parseOfferForm(form(goodOffer));
    expect(r.errors).toEqual({});
    expect(r.values).toMatchObject({ track: "adults_professional", price_hour_kes: 1800, trial_discount_pct: 50, outcomes: ["Emails that get read", "Leading meetings"] });
  });
  it("enforces the hourly price band for the track", () => {
    const r = parseOfferForm(form(goodOffer.map(([k, v]) => [k, k === "price_hour_kes" ? "4000" : v])));
    expect(r.errors.price_hour_kes).toMatch(/between KES 700 and KES 2,500/);
  });
  it("lets the teacher choose practical for categories that allow it", () => {
    const r = parseOfferForm(
      form([...goodOffer.filter(([k]) => k !== "category"), ["category", "digital_practical_skills"], ["kind", "practical"]]),
    );
    expect(r.values?.track).toBe("practical");
  });
  it("needs a meeting tool for online lessons and drops it for in-person only", () => {
    expect(parseOfferForm(form(goodOffer.filter(([k]) => k !== "meeting_tool"))).errors.meeting_tool).toBeDefined();
    const inPerson = parseOfferForm(form([...goodOffer.filter(([k]) => k !== "modes"), ["modes", "in_home"]]));
    expect(inPerson.values?.meeting_tool).toBeNull();
  });
  it("saves a half-finished draft with only a title and category, but not for review", () => {
    const partial = form([["title", "Excel for bookkeepers"], ["category", "digital_practical_skills"]]);
    const draft = parseOfferForm(partial, undefined, "draft");
    expect(draft.errors).toEqual({});
    expect(draft.values).toMatchObject({ price_hour_kes: null, modes: ["online"], language_codes: ["en"], summary: null });
    expect(Object.keys(parseOfferForm(partial).errors)).toEqual(expect.arrayContaining(["summary", "subject_text", "modes", "price_hour_kes", "language_codes"]));
  });
  it("still checks what a draft does contain", () => {
    const r = parseOfferForm(form([["title", "Excel"], ["category", "digital_practical_skills"], ["price_hour_kes", "9000"]]), undefined, "draft");
    expect(r.errors.price_hour_kes).toMatch(/between/);
  });
  it("takes optional package prices up to the single-session total", () => {
    const ok = parseOfferForm(form([...goodOffer, ["price_pkg8_kes", "11,000"]]));
    expect(ok.values).toMatchObject({ price_pkg8_kes: 11000, price_pkg12_kes: null });
    // 1,800 an hour for 50 minutes is 1,500 a session: 8 sessions cannot cost more than 12,000
    expect(parseOfferForm(form([...goodOffer, ["price_pkg8_kes", "12001"]])).errors.price_pkg8_kes).toMatch(/KES 12,000/);
    expect(parseOfferForm(form([...goodOffer, ["price_pkg16_kes", "abc"]])).errors.price_pkg16_kes).toBeDefined();
  });
  it("takes the expert’s own packages in place of the standard sizes", () => {
    const own: [string, string][] = [["package_mode", "own"], ["pkg_name_1", "Starter Package"], ["pkg_sessions_1", "4"], ["pkg_price_1", "5,600"], ["pkg_validity_1", "8"], ["price_pkg8_kes", "11000"]];
    const r = parseOfferForm(form([...goodOffer, ...own]));
    expect(r.errors).toEqual({});
    expect(r.values?.packages).toEqual([{ name: "Starter Package", description: null, sessions: 4, price_kes: 5600, validity_weeks: 8 }]);
    expect(r.values?.price_pkg8_kes).toBeNull();
    // 4 sessions at 1,500 each is 6,000 at most; two packages cannot have the same number of sessions
    const bad = parseOfferForm(form([...goodOffer, ...own, ["pkg_name_2", "X"], ["pkg_sessions_2", "4"], ["pkg_price_2", "6001"]]));
    expect(bad.errors.pkg_name_2).toBeDefined();
    expect(bad.errors.pkg_sessions_2).toMatch(/already/);
    expect(bad.errors.pkg_price_2).toMatch(/KES 6,000/);
    expect(stepOfField("pkg_price_2")).toBe(2);
    // without "own" the rows are ignored
    expect(parseOfferForm(form([...goodOffer, ...own.slice(1)])).values?.packages).toEqual([]);
  });
  it("takes a group format with a price per learner, a group size and sessions", () => {
    const base = goodOffer.filter(([k]) => !["price_hour_kes", "trial", "duration_minutes"].includes(k));
    const group: [string, string][] = [...base, ["format", "cohort"], ["duration_minutes", "90"], ["price_seat_kes", "12,000"], ["capacity_min", "3"], ["capacity_max", "10"], ["sessions_in_run", "6"]];
    const r = parseOfferForm(form(group));
    expect(r.errors).toEqual({});
    expect(r.values).toMatchObject({ format: "cohort", price_seat_kes: 12000, capacity_min: 3, capacity_max: 10, sessions_in_run: 6, price_hour_kes: null, trial_discount_pct: null, packages: [] });
    // a workshop is one session; the minimum cannot pass the group size; the hourly band does not apply
    expect(parseOfferForm(form([...group.filter(([k]) => k !== "format" && k !== "sessions_in_run"), ["format", "workshop"]])).values?.sessions_in_run).toBe(1);
    expect(parseOfferForm(form([...group.filter(([k]) => k !== "capacity_min"), ["capacity_min", "11"]])).errors.capacity_min).toBeDefined();
    expect(parseOfferForm(form(group.filter(([k]) => k !== "price_seat_kes"))).errors.price_seat_kes).toBeDefined();
    expect(parseOfferForm(form([...group.filter(([k]) => k !== "duration_minutes"), ["duration_minutes", "50"]])).errors.duration_minutes).toBeDefined();
    expect(stepOfField("capacity_max")).toBe(1);
    expect(stepOfField("price_seat_kes")).toBe(2);
  });
  it("knows which step owns a field", () => {
    expect(stepOfField("title")).toBe(0);
    expect(stepOfField("meeting_tool")).toBe(1);
    expect(stepOfField("price_pkg12_kes")).toBe(2);
  });
  it("prices a session from the hourly rate", () => {
    expect(sessionPrice(1800, 50)).toBe(1500);
  });
});

describe("teacher application", () => {
  const good: [string, string][] = [
    ["display_name", "Lydia Mwende"],
    ["headline", "Ran corporate communications at a Nairobi bank for nine years."],
    ["bio", "I led internal and client communications for nine years and now help professionals write and speak clearly at work."],
    ["teacher_type", "professional"],
    ["employment_status", "self_employed"],
    ["declaration", "on"],
    ["county_code", "nairobi"],
    ["languages", "en"],
    ["categories", "career_professional_growth"],
  ];
  it("accepts a complete application", () => {
    expect(parseTeacherForm(form(good), ["nairobi"]).errors).toEqual({});
  });
  it("requires the employment declaration", () => {
    expect(parseTeacherForm(form(good.filter(([k]) => k !== "declaration")), ["nairobi"]).errors.declaration).toBeDefined();
  });
  it("blocks submission for full-time TSC teachers", () => {
    expect(blocksSubmission("tsc_full_time")).toBe(true);
    expect(blocksSubmission("tsc_part_time")).toBe(false);
  });
});

describe("availability window", () => {
  it("rejects an end before the start", () => {
    expect(parseWindow(form([["weekday", "1"], ["starts", "18:00"], ["ends", "17:00"]])).errors.starts).toBeDefined();
    expect(parseWindow(form([["weekday", "1"], ["starts", "17:00"], ["ends", "19:00"]])).values).toEqual({ weekday: 1, starts: "17:00", ends: "19:00" });
  });
});
