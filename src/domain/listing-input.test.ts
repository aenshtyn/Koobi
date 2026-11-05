import { describe, expect, it } from "vitest";
import { blocksSubmission, parseOfferForm, parseTeacherForm, parseWindow, sessionPrice } from "./listing-input";

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
