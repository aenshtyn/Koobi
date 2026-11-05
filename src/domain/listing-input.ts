/**
 * Validation for the teacher application and the offer editor (PRD FR-OFF-2, FR-OFF-3, FR-OFF-6).
 * Pure functions so the rules are unit-tested; the database re-checks shape, states and ownership.
 */
import { CATEGORIES, type CategoryCode, type TrackCode } from "./taxonomy";

type Getter = { get(k: string): FormDataEntryValue | null; getAll(k: string): FormDataEntryValue[] };
type Result<T> = { values?: T; errors: Record<string, string> };

const str = (f: Getter, k: string) => String(f.get(k) ?? "").trim();
const all = (f: Getter, k: string) => f.getAll(k).map((v) => String(v));

/** Tracks each public category allows (mirrors category_tracks in supabase/seed.sql). */
export const CATEGORY_TRACKS: Record<CategoryCode, TrackCode[]> = {
  career_professional_growth: ["adults_professional"],
  business_entrepreneurship: ["adults_professional", "practical"],
  school_academic: ["school"],
  digital_practical_skills: ["adults_professional", "practical"],
};

/**
 * Hourly price bands per track, from the IDEA §2 demand table (PRD FR-OFF-3) [assumption].
 * Enforced here until the parameters table carries them; then read the dated rows instead.
 */
export const PRICE_BANDS: Record<TrackCode, { min: number; max: number }> = {
  school: { min: 500, max: 5000 },
  adults_professional: { min: 700, max: 2500 },
  practical: { min: 500, max: 2000 },
};

export const TEACHER_TYPES = [
  ["trained_teacher", "Trained teacher"],
  ["retired_teacher", "Retired teacher or lecturer"],
  ["professional", "Professional (engineer, accountant, HR, marketing…)"],
  ["practitioner", "Practitioner (farming, trades, crafts)"],
  ["university_student", "University student"],
] as const;

export const EMPLOYMENT = [
  ["not_employed", "Not employed"],
  ["self_employed", "Self-employed"],
  ["privately_employed", "Employed by a private company"],
  ["tsc_part_time", "Employed by TSC, not full time"],
  ["tsc_full_time", "Employed by TSC full time"],
  ["student", "Student"],
  ["retired", "Retired"],
] as const;

export const EMPLOYMENT_DECLARATION_VERSION = "2026-11-v1";
export const DURATIONS = [30, 45, 50, 60, 75, 90, 120] as const;
export const MEETING_TOOLS = { google_meet: "Google Meet", zoom: "Zoom" } as const;
export const OFFER_MODES = [
  ["online", "Online"],
  ["in_home", "At the learner's home"],
  ["teacher_premises", "At my place"],
] as const;
export const CURRICULA = [
  ["cbc", "CBC/CBE"],
  ["eight_four_four", "8-4-4"],
  ["igcse", "IGCSE/Cambridge"],
] as const;
export const LANGUAGES = [
  ["en", "English"],
  ["sw", "Kiswahili"],
] as const;

export const sessionPrice = (hourly: number, minutes: number) => Math.round((hourly * minutes) / 60);

// ---------------------------------------------------------------------------

export type TeacherInput = {
  display_name: string;
  headline: string;
  bio: string;
  teacher_type: string;
  employment_status: string;
  county_code: string | null;
  languages: string[];
  categories: CategoryCode[];
};

export function parseTeacherForm(f: Getter, counties: string[]): Result<TeacherInput> {
  const errors: Record<string, string> = {};
  const v: TeacherInput = {
    display_name: str(f, "display_name"),
    headline: str(f, "headline"),
    bio: str(f, "bio"),
    teacher_type: str(f, "teacher_type"),
    employment_status: str(f, "employment_status"),
    county_code: str(f, "county_code") || null,
    languages: all(f, "languages").filter((l) => LANGUAGES.some(([c]) => c === l)),
    categories: all(f, "categories").filter((c): c is CategoryCode => CATEGORIES.some((x) => x.code === c)),
  };
  if (v.display_name.length < 2 || v.display_name.length > 80) errors.display_name = "Use the name learners will see, 2 to 80 characters.";
  if (v.headline.length < 15) errors.headline = "Say what you have done, where and for how long, in one line.";
  else if (v.headline.length > 140) errors.headline = "Keep it under 140 characters.";
  if (v.bio.length < 80) errors.bio = "Tell learners a little more: at least 80 characters.";
  else if (v.bio.length > 4000) errors.bio = "Keep it under 4,000 characters.";
  if (!TEACHER_TYPES.some(([c]) => c === v.teacher_type)) errors.teacher_type = "Choose the one that fits best.";
  if (!EMPLOYMENT.some(([c]) => c === v.employment_status)) errors.employment_status = "Choose your current employment.";
  if (f.get("declaration") !== "on") errors.declaration = "Confirm the declaration to continue.";
  if (v.county_code && !counties.includes(v.county_code)) errors.county_code = "Choose a county from the list.";
  if (!v.languages.length) errors.languages = "Choose at least one language you teach in.";
  if (!v.categories.length) errors.categories = "Choose at least one category.";
  return Object.keys(errors).length ? { errors } : { values: v, errors };
}

/** TSC Code of Conduct s.28(d): full-time TSC teachers may not take other paid work. */
export const blocksSubmission = (employment: string | null) => employment === "tsc_full_time";

// ---------------------------------------------------------------------------

export type OfferInput = {
  title: string;
  summary: string;
  category: CategoryCode;
  track: TrackCode;
  subject_text: string;
  curriculum_code: string | null;
  goal: string | null;
  description: string | null;
  outcomes: string[];
  modes: string[];
  meeting_tool: string | null;
  duration_minutes: number;
  price_hour_kes: number;
  trial_discount_pct: number | null;
  language_codes: string[];
};

/** Bands default to the seeded values; the server passes the dated parameters in force (sprint 8). */
export function parseOfferForm(f: Getter, bands: Record<TrackCode, { min: number; max: number }> = PRICE_BANDS): Result<OfferInput> {
  const errors: Record<string, string> = {};
  const category = str(f, "category") as CategoryCode;
  const allowed = CATEGORY_TRACKS[category];
  const kind = str(f, "kind") as TrackCode;
  const track = allowed ? (allowed.length === 1 ? allowed[0] : (allowed.includes(kind) ? kind : allowed[0])) : ("adults_professional" as TrackCode);
  const modes = all(f, "modes").filter((m) => OFFER_MODES.some(([c]) => c === m));
  const tool = str(f, "meeting_tool");
  const outcomes = str(f, "outcomes")
    .split("\n")
    .map((s) => s.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  const duration = Number(str(f, "duration_minutes"));
  const price = Number(str(f, "price_hour_kes").replace(/[,\s]/g, ""));
  const curriculum = str(f, "curriculum_code");

  const v: OfferInput = {
    title: str(f, "title"),
    summary: str(f, "summary"),
    category,
    track,
    subject_text: str(f, "subject_text"),
    curriculum_code: track === "school" && CURRICULA.some(([c]) => c === curriculum) ? curriculum : null,
    goal: str(f, "goal") || null,
    description: str(f, "description") || null,
    outcomes,
    modes,
    meeting_tool: modes.includes("online") ? tool : null,
    duration_minutes: duration,
    price_hour_kes: price,
    trial_discount_pct: f.get("trial") === "on" ? 50 : null,
    language_codes: all(f, "language_codes").filter((l) => LANGUAGES.some(([c]) => c === l)),
  };

  if (v.title.length < 3 || v.title.length > 120) errors.title = "Give it a clear title, 3 to 120 characters.";
  if (!allowed) errors.category = "Choose a category.";
  if (v.summary.length < 10) errors.summary = "Add one line for the card: what the learner gets.";
  else if (v.summary.length > 300) errors.summary = "Keep it under 300 characters.";
  if (!v.subject_text) errors.subject_text = "Name the subject or skill.";
  else if (v.subject_text.length > 120) errors.subject_text = "Keep it under 120 characters.";
  if (v.goal && v.goal.length > 300) errors.goal = "Keep it under 300 characters.";
  if (v.description && v.description.length > 5000) errors.description = "Keep it under 5,000 characters.";
  if (outcomes.length > 10) errors.outcomes = "Up to 10 points.";
  else if (outcomes.some((o) => o.length > 200) || outcomes.join("").length > 2000) errors.outcomes = "Keep each point short.";
  if (!modes.length) errors.modes = "Choose at least one place where lessons happen.";
  if (modes.includes("online") && !(tool in MEETING_TOOLS)) errors.meeting_tool = "Choose Google Meet or Zoom for online lessons.";
  if (!DURATIONS.includes(duration as (typeof DURATIONS)[number])) errors.duration_minutes = "Choose a session length.";
  const band = bands[track] ?? PRICE_BANDS[track];
  if (!Number.isInteger(price) || price <= 0) errors.price_hour_kes = "Enter the price per hour in whole shillings.";
  else if (price < band.min || price > band.max) errors.price_hour_kes = `For this kind of offer the price per hour must be between KES ${band.min.toLocaleString("en-KE")} and KES ${band.max.toLocaleString("en-KE")}.`;
  if (!v.language_codes.length) errors.language_codes = "Choose at least one language.";
  return Object.keys(errors).length ? { errors } : { values: v, errors };
}

/** Weekly availability window, Nairobi local time. */
export function parseWindow(f: Getter): Result<{ weekday: number; starts: string; ends: string }> {
  const weekday = Number(str(f, "weekday"));
  const starts = str(f, "starts");
  const ends = str(f, "ends");
  const errors: Record<string, string> = {};
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) errors.weekday = "Choose a day.";
  if (!/^\d{2}:\d{2}$/.test(starts) || !/^\d{2}:\d{2}$/.test(ends)) errors.starts = "Choose a start and end time.";
  else if (starts >= ends) errors.starts = "The end time must be after the start.";
  return Object.keys(errors).length ? { errors } : { values: { weekday, starts, ends }, errors };
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
