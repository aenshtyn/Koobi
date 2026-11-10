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

/** The four formats an expert can create. A group format is priced per learner for the whole group. */
export const OFFER_FORMATS = ["one_to_one", "small_group", "workshop", "cohort"] as const;
export type OfferFormat = (typeof OFFER_FORMATS)[number];
export const isGroup = (format: string) => format !== "one_to_one";
/** Longer sessions for groups: a workshop can run half a day. */
export const GROUP_DURATIONS = [60, 90, 120, 180, 240] as const;
export const GROUP_LIMITS = { seatsMax: 30, sessionsMax: 24, priceMax: 500_000, schoolGroup: { min: 3, max: 6 } } as const;

export type OfferInput = {
  format: OfferFormat;
  price_seat_kes: number | null;
  capacity_min: number | null;
  capacity_max: number | null;
  sessions_in_run: number | null;
  title: string;
  summary: string | null;
  category: CategoryCode;
  track: TrackCode;
  subject_text: string | null;
  curriculum_code: string | null;
  goal: string | null;
  description: string | null;
  outcomes: string[];
  modes: string[];
  meeting_tool: string | null;
  duration_minutes: number;
  price_hour_kes: number | null;
  price_pkg8_kes: number | null;
  price_pkg12_kes: number | null;
  price_pkg16_kes: number | null;
  trial_discount_pct: number | null;
  language_codes: string[];
  /** The expert's own packages; when there are any they replace the standard sizes. */
  packages: OwnPackage[];
};

/** Package sizes learners can buy (FR-BOOK-6). A package price is optional and never above the session price times the sessions. */
export const PACKAGE_SIZES = [8, 12, 16] as const;

/** A package the expert names: sessions, total price, and how long the learner has to use them. */
export type OwnPackage = { name: string; description: string | null; sessions: number; price_kes: number; validity_weeks: number | null };
export const MAX_OWN_PACKAGES = 4;
export const PACKAGE_VALIDITY = [
  ["", "Koobi’s standard period"],
  ["4", "1 month"],
  ["8", "2 months"],
  ["13", "3 months"],
  ["26", "6 months"],
] as const;

/** The create form's four steps, and the fields each one owns (for showing an error on the right step). */
export const OFFER_STEPS = [
  { key: "basics", label: "Basics", fields: ["title", "category", "kind", "subject_text", "curriculum_code", "summary", "description", "outcomes", "goal"] },
  { key: "format", label: "Format", fields: ["modes", "meeting_tool", "duration_minutes", "language_codes", "capacity_min", "capacity_max", "sessions_in_run"] },
  { key: "pricing", label: "Pricing", fields: ["price_seat_kes", "price_hour_kes", "price_pkg8_kes", "price_pkg12_kes", "price_pkg16_kes", "trial", "package_mode"] },
  { key: "preview", label: "Preview", fields: [] },
] as const;

export function stepOfField(field: string): number {
  if (field.startsWith("pkg_")) return 2;
  const i = OFFER_STEPS.findIndex((s) => (s.fields as readonly string[]).includes(field));
  return i < 0 ? 0 : i;
}

/**
 * Bands default to the seeded values; the server passes the dated parameters in force (sprint 8).
 * mode "draft" only needs a title and a category, so a half-finished form can be saved; "submit"
 * needs everything a learner and a reviewer must see.
 */
export function parseOfferForm(
  f: Getter,
  bands: Record<TrackCode, { min: number; max: number }> = PRICE_BANDS,
  mode: "submit" | "draft" = "submit",
): Result<OfferInput> {
  const errors: Record<string, string> = {};
  const full = mode === "submit";
  const category = str(f, "category") as CategoryCode;
  const allowed = CATEGORY_TRACKS[category];
  const kind = str(f, "kind") as TrackCode;
  const track = allowed ? (allowed.length === 1 ? allowed[0] : (allowed.includes(kind) ? kind : allowed[0])) : ("adults_professional" as TrackCode);
  const picked = all(f, "modes").filter((m) => OFFER_MODES.some(([c]) => c === m));
  const modes = picked.length || full ? picked : ["online"];
  const tool = str(f, "meeting_tool");
  const outcomes = str(f, "outcomes")
    .split("\n")
    .map((s) => s.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  const duration = Number(str(f, "duration_minutes") || "60");
  const num = (k: string) => {
    const raw = str(f, k).replace(/[,\s]/g, "");
    return raw === "" ? null : Number(raw);
  };
  const price = num("price_hour_kes");
  const curriculum = str(f, "curriculum_code");
  const langs = all(f, "language_codes").filter((l) => LANGUAGES.some(([c]) => c === l));

  const rawFormat = str(f, "format");
  const format: OfferFormat = (OFFER_FORMATS as readonly string[]).includes(rawFormat) ? (rawFormat as OfferFormat) : "one_to_one";
  const group = isGroup(format);
  const own = !group && str(f, "package_mode") === "own";
  const rows: { i: number; name: string; description: string | null; sessions: number | null; price: number | null; validity: number | null }[] = [];
  if (own) {
    for (let i = 1; i <= MAX_OWN_PACKAGES; i++) {
      const name = str(f, `pkg_name_${i}`);
      const sessions = num(`pkg_sessions_${i}`);
      const pkgPrice = num(`pkg_price_${i}`);
      if (!name && sessions === null && pkgPrice === null) continue;
      const validity = str(f, `pkg_validity_${i}`);
      rows.push({ i, name, description: str(f, `pkg_desc_${i}`) || null, sessions, price: pkgPrice, validity: PACKAGE_VALIDITY.some(([c]) => c === validity && c) ? Number(validity) : null });
    }
  }

  const v: OfferInput = {
    format,
    price_seat_kes: group ? num("price_seat_kes") : null,
    capacity_min: group ? (num("capacity_min") ?? 1) : null,
    capacity_max: group ? num("capacity_max") : null,
    sessions_in_run: !group ? null : format === "workshop" ? 1 : num("sessions_in_run"),
    title: str(f, "title"),
    summary: str(f, "summary") || null,
    category,
    track,
    subject_text: str(f, "subject_text") || null,
    curriculum_code: track === "school" && CURRICULA.some(([c]) => c === curriculum) ? curriculum : null,
    goal: str(f, "goal") || null,
    description: str(f, "description") || null,
    outcomes,
    modes,
    meeting_tool: modes.includes("online") && tool in MEETING_TOOLS ? tool : null,
    duration_minutes: duration,
    price_hour_kes: group ? null : price,
    price_pkg8_kes: own || group ? null : num("price_pkg8_kes"),
    price_pkg12_kes: own || group ? null : num("price_pkg12_kes"),
    price_pkg16_kes: own || group ? null : num("price_pkg16_kes"),
    trial_discount_pct: !group && f.get("trial") === "on" ? 50 : null,
    language_codes: langs.length || full ? langs : ["en"],
    packages: rows.map((r) => ({ name: r.name, description: r.description, sessions: r.sessions ?? 0, price_kes: r.price ?? 0, validity_weeks: r.validity })),
  };

  if (v.title.length < 3 || v.title.length > 120) errors.title = "Give it a clear title, 3 to 120 characters.";
  if (!allowed) errors.category = "Choose a category.";
  if (full && (v.summary ?? "").length < 10) errors.summary = "Add one line for the card: what the learner gets.";
  else if ((v.summary ?? "").length > 300) errors.summary = "Keep it under 300 characters.";
  if (full && !v.subject_text) errors.subject_text = "Name the subject or skill.";
  else if ((v.subject_text ?? "").length > 120) errors.subject_text = "Keep it under 120 characters.";
  if (v.goal && v.goal.length > 300) errors.goal = "Keep it under 300 characters.";
  if (v.description && v.description.length > 5000) errors.description = "Keep it under 5,000 characters.";
  if (outcomes.length > 10) errors.outcomes = "Up to 10 points.";
  else if (outcomes.some((o) => o.length > 200) || outcomes.join("").length > 2000) errors.outcomes = "Keep each point short.";
  if (!modes.length) errors.modes = "Choose at least one place where lessons happen.";
  if (full && modes.includes("online") && !(tool in MEETING_TOOLS)) errors.meeting_tool = "Choose Google Meet or Zoom for online lessons.";
  if (!((group ? GROUP_DURATIONS : DURATIONS) as readonly number[]).includes(duration)) errors.duration_minutes = "Choose a session length.";
  const band = bands[track] ?? PRICE_BANDS[track];
  const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;
  if (group) {
    const whole = (n: number | null): n is number => n !== null && Number.isInteger(n);
    const school = format === "small_group" && track === "school";
    const top = school ? GROUP_LIMITS.schoolGroup.max : GROUP_LIMITS.seatsMax;
    const floor = school ? GROUP_LIMITS.schoolGroup.min : 1;
    if (v.capacity_max === null) {
      if (full) errors.capacity_max = "Say how many learners the group can take.";
    } else if (!whole(v.capacity_max) || v.capacity_max < Math.max(2, floor) || v.capacity_max > top) errors.capacity_max = school ? "A school group takes 3 to 6 learners." : `Between 2 and ${top} learners.`;
    if (!whole(v.capacity_min) || v.capacity_min < floor) errors.capacity_min = school ? "A school group needs at least 3 learners." : "At least 1 learner.";
    else if (whole(v.capacity_max) && v.capacity_min > v.capacity_max) errors.capacity_min = "The minimum cannot be more than the group size.";
    if (format !== "workshop") {
      if (v.sessions_in_run === null) {
        if (full) errors.sessions_in_run = "Say how many sessions the group meets for.";
      } else if (!whole(v.sessions_in_run) || v.sessions_in_run < 1 || v.sessions_in_run > GROUP_LIMITS.sessionsMax) errors.sessions_in_run = `Between 1 and ${GROUP_LIMITS.sessionsMax} sessions.`;
    }
    if (v.price_seat_kes === null) {
      if (full) errors.price_seat_kes = "Enter the price for one learner in whole shillings.";
    } else if (!whole(v.price_seat_kes) || v.price_seat_kes <= 0) errors.price_seat_kes = "Enter the price for one learner in whole shillings.";
    else if (v.price_seat_kes > GROUP_LIMITS.priceMax) errors.price_seat_kes = `Keep it under ${kes(GROUP_LIMITS.priceMax)}.`;
  } else if (price === null) {
    if (full) errors.price_hour_kes = "Enter the price per hour in whole shillings.";
  } else if (!Number.isInteger(price) || price <= 0) errors.price_hour_kes = "Enter the price per hour in whole shillings.";
  else if (price < band.min || price > band.max) errors.price_hour_kes = `For this kind of learning experience the price per hour must be between ${kes(band.min)} and ${kes(band.max)}.`;
  for (const n of PACKAGE_SIZES) {
    const key = `price_pkg${n}_kes` as const;
    const pkg = v[key];
    if (pkg === null) continue;
    if (!Number.isInteger(pkg) || pkg <= 0) errors[key] = "Enter the package price in whole shillings, or leave it empty.";
    else if (price === null || errors.price_hour_kes) errors[key] = "Set the price per hour first.";
    else if (pkg > sessionPrice(price, duration) * n) errors[key] = `A package cannot cost more than ${n} single sessions (${kes(sessionPrice(price, duration) * n)}).`;
  }
  const sizes = new Set<number>();
  for (const r of rows) {
    if (r.name.length < 2 || r.name.length > 60) errors[`pkg_name_${r.i}`] = "Name the package, 2 to 60 characters.";
    if ((r.description ?? "").length > 200) errors[`pkg_desc_${r.i}`] = "Keep it under 200 characters.";
    if (r.sessions === null || !Number.isInteger(r.sessions) || r.sessions < 2 || r.sessions > 52) errors[`pkg_sessions_${r.i}`] = "Between 2 and 52 sessions.";
    else if (sizes.has(r.sessions)) errors[`pkg_sessions_${r.i}`] = "Another package already has this many sessions.";
    else sizes.add(r.sessions);
    if (r.price === null || !Number.isInteger(r.price) || r.price <= 0) errors[`pkg_price_${r.i}`] = "Enter the total price in whole shillings.";
    else if (price === null || errors.price_hour_kes) errors[`pkg_price_${r.i}`] = "Set the price per hour first.";
    else if (r.sessions !== null && Number.isInteger(r.sessions) && r.price > sessionPrice(price, duration) * r.sessions)
      errors[`pkg_price_${r.i}`] = `A package cannot cost more than ${r.sessions} single sessions (${kes(sessionPrice(price, duration) * r.sessions)}).`;
  }
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
