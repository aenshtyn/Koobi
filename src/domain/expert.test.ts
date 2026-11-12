import { describe, expect, it } from "vitest";
import {
  NO_REQUIREMENTS,
  canPublish,
  groupWeeklyHours,
  normalisePhone,
  parseLinks,
  parseSpecialisations,
  parseStep1,
  parseStep2,
  parseStep3,
  profileCompletion,
  showField,
  stepsComplete,
  wordCount,
  workflowProgress,
  type Application,
} from "./expert";

const form = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

describe("the application's steps", () => {
  it("step 1 needs a full legal name, a phone with its country code, a country and a city", () => {
    const bad = parseStep1(form([["display_name", "Amina"], ["contact_phone", "12345"], ["country_code", "XX"], ["city", ""]]));
    expect(Object.keys(bad.errors).sort()).toEqual(["city", "contact_phone", "country_code", "display_name"]);
    const ok = parseStep1(form([["display_name", "  Amina   Wanjiru "], ["contact_phone", "0712 345 678"], ["country_code", "KE"], ["city", "Nairobi"]]));
    expect(ok.errors).toEqual({});
    expect(ok.values).toEqual({ display_name: "Amina Wanjiru", contact_phone: "+254712345678", country_code: "KE", city: "Nairobi" });
  });

  it("accepts phone numbers from other countries", () => {
    expect(normalisePhone("+90 (532) 123-45-67")).toBe("+905321234567");
    expect(normalisePhone("254712345678")).toBe("+254712345678");
    expect(normalisePhone("712345678")).toBeNull();
  });

  it("step 2 holds the biography to 100 to 250 words", () => {
    const base: [string, string][] = [["headline", "Business consultant"], ["experience_band", "6_10"], ["achievements", "Ran a consultancy for ten years."], ["employment_status", "self_employed"]];
    expect(parseStep2(form([...base, ["bio", words(99)]])).errors.bio).toMatch(/at least 100/);
    expect(parseStep2(form([...base, ["bio", words(251)]])).errors.bio).toMatch(/250 words/);
    const ok = parseStep2(form([...base, ["bio", words(120)], ["website_url", ""]]));
    expect(ok.errors).toEqual({});
    expect(ok.values.education_level).toBeNull(); // education is optional
    expect(parseStep2(form([...base, ["bio", words(120)], ["website_url", "linkedin.com/in/me"]])).errors.website_url).toBeTruthy();
  });

  it("step 3 turns the specialisations into tags and needs every choice", () => {
    expect(parseSpecialisations("Strategy, bookkeeping; strategy\nTax")).toEqual(["Strategy", "bookkeeping", "Tax"]);
    const empty = parseStep3(form([]));
    expect(Object.keys(empty.errors).sort()).toEqual(["audiences", "formats_offered", "languages", "learner_outcomes", "primary_category", "specialisations"]);
    const ok = parseStep3(
      form([["primary_category", "business_entrepreneurship"], ["specialisations", "Strategy, Tax"], ["audiences", "entrepreneurs"], ["audiences", "nobody"], ["languages", "en"], ["formats_offered", "one_to_one"], ["formats_offered", "site_visit"], ["learner_outcomes", "Keep books that tell the truth."]]),
    );
    expect(ok.errors).toEqual({});
    expect(ok.values.audiences).toEqual(["entrepreneurs"]);
    expect(ok.values.formats_offered).toEqual(["one_to_one"]); // only the four online formats
  });

  it("portfolio links must be full https addresses", () => {
    expect(parseLinks(form([["portfolio_links", "https://example.com/work"], ["portfolio_links", ""]])).values.portfolio_links).toEqual(["https://example.com/work"]);
    expect(parseLinks(form([["portfolio_links", "example.com"]])).errors.portfolio_links).toBeTruthy();
  });

  it("a step counts as complete only when its required answers are there", () => {
    const a: Application = {
      display_name: "Amina Wanjiru", contact_phone: "+254712345678", country_code: "KE", city: "Nairobi", photo_url: null, headline: "Consultant", bio: words(120),
      education_level: null, education_field: null, experience_band: "6_10", achievements: "Ten years.", employment_status: "self_employed", employer: null, website_url: null,
      primary_category: "business_entrepreneurship", specialisations: ["Tax"], audiences: ["teams"], languages: ["en"], formats_offered: ["workshop"], learner_outcomes: "Results.", portfolio_links: [],
    };
    expect(stepsComplete(a, false)).toEqual([false, true, true, false]); // no photo, no ID yet
    expect(stepsComplete({ ...a, photo_url: "https://x/p.jpg" }, true)).toEqual([true, true, true, true]);
    expect(stepsComplete({ ...a, bio: words(40) }, true)[1]).toBe(false);
  });
});

describe("where an application stands", () => {
  const at = (application_status: Parameters<typeof workflowProgress>[0]["application_status"], held = false) => workflowProgress({ application_status, meeting_invited_at: null, meeting_held_at: held ? "2026-11-12T09:00:00Z" : null });
  it("counts finished stages of the six", () => {
    expect(at("draft")).toBe(0);
    expect(at("submitted")).toBe(1);
    expect(at("under_verification")).toBe(1);
    expect(at("meeting_required")).toBe(3);
    expect(at("meeting_required", true)).toBe(4);
    expect(at("approved")).toBe(6);
  });
});

describe("profile completion and publication", () => {
  it("counts requirements that are really met, not sections opened", () => {
    expect(profileCompletion(NO_REQUIREMENTS)).toMatchObject({ done: 0, total: 7, pct: 0 });
    const info = { ...NO_REQUIREMENTS, approved: true, photo: true, basic: true, biography: true, background: true, expertise: true };
    expect(profileCompletion(info)).toMatchObject({ done: 5, total: 7, pct: 71 });
    expect(profileCompletion({ ...info, video: true, experience: true }).pct).toBe(100);
  });

  it("can publish only when the expert is approved, the profile and photo are complete, the video is approved and a learning experience is approved", () => {
    const all = { approved: true, photo: true, basic: true, biography: true, background: true, expertise: true, video: true, experience: true, published: false };
    expect(canPublish(all)).toBe(true);
    for (const k of ["approved", "photo", "basic", "biography", "background", "expertise", "video", "experience"] as const) expect(canPublish({ ...all, [k]: false })).toBe(false);
  });

  it("shows codes as people read them in a review", () => {
    expect(showField("country_code", "KE")).toBe("Kenya");
    expect(showField("experience_band", "6_10")).toBe("6 to 10 years");
    expect(showField("audiences", ["teams", "anyone"])).toBe("Teams and organisations, Anyone interested in learning this skill");
    expect(showField("bio", null)).toBe("—");
  });
});

describe("weekly hours on the public profile", () => {
  it("joins days in a row that share the same hours", () => {
    const week = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, starts: "09:00", ends: "17:00" }));
    expect(groupWeeklyHours([...week, { weekday: 6, starts: "10:00", ends: "14:00" }])).toEqual([
      { days: "Monday to Friday", hours: "09:00–17:00" },
      { days: "Saturday", hours: "10:00–14:00" },
    ]);
  });
  it("keeps separate days apart and lists two ranges on one day", () => {
    expect(groupWeeklyHours([{ weekday: 1, starts: "09:00", ends: "12:00" }, { weekday: 1, starts: "14:00", ends: "17:00" }, { weekday: 3, starts: "09:00", ends: "12:00" }, { weekday: 0, starts: "09:00", ends: "12:00" }])).toEqual([
      { days: "Monday", hours: "09:00–12:00, 14:00–17:00" },
      { days: "Wednesday", hours: "09:00–12:00" },
      { days: "Sunday", hours: "09:00–12:00" },
    ]);
  });
  it("counts words", () => {
    expect(wordCount("  one  two\nthree ")).toBe(3);
    expect(wordCount("")).toBe(0);
  });
});
