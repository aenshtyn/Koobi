/**
 * Expert onboarding and the public profile: the five application steps, the statuses, and the rules
 * for completion and publication. Pure functions so the rules are unit-tested; the database applies
 * the same rules again (supabase/migrations/20261107000100_expert_onboarding.sql).
 */
import { CATEGORIES, type CategoryCode } from "./taxonomy";
import { EMPLOYMENT, LANGUAGES, OFFER_FORMATS } from "./listing-input";

type Getter = { get(k: string): FormDataEntryValue | null; getAll(k: string): FormDataEntryValue[] };
const str = (f: Getter, k: string) => String(f.get(k) ?? "").trim();
const all = (f: Getter, k: string) => f.getAll(k).map((v) => String(v));

export const TERMS_VERSION = "expert-2026-11-v1";

// ---------------------------------------------------------------------------
// Statuses

export type ApplicationStatus = "draft" | "submitted" | "under_verification" | "meeting_required" | "more_info" | "approved" | "rejected";

export const APPLICATION_STATUS: Record<ApplicationStatus, { label: string; tone: string }> = {
  draft: { label: "Not submitted", tone: "bg-sand text-ink" },
  submitted: { label: "Submitted", tone: "bg-info-tint text-info" },
  under_verification: { label: "Under verification", tone: "bg-info-tint text-info" },
  meeting_required: { label: "Meeting required", tone: "bg-hi text-ink" },
  more_info: { label: "More information needed", tone: "bg-hi text-ink" },
  approved: { label: "Approved", tone: "bg-forest-tint text-forest-ink" },
  rejected: { label: "Not approved", tone: "bg-error-tint text-error" },
};

/** The expert can edit the application only while it is theirs. */
export const applicationEditable = (s: ApplicationStatus) => s === "draft" || s === "more_info";

/** The six stages the partner's workflow names, and where an application stands in them. */
export const WORKFLOW = [
  { key: "submitted", title: "Application submitted", text: "You completed the five steps and sent your application." },
  { key: "verification", title: "Document verification", text: "We check your identity document and any qualifications you sent." },
  { key: "invitation", title: "Meeting invitation", text: "If your documents are in order, we email you an invitation to a 15-minute online meeting." },
  { key: "meeting", title: "Onboarding meeting", text: "We talk about your experience, your areas of expertise and how you work with learners." },
  { key: "decision", title: "Final decision", text: "We approve the application, decline it, or return it to you for more information." },
  { key: "active", title: "Approved and active", text: "Your expert dashboard opens. Your profile and each learning experience are reviewed before they are public." },
] as const;

/** How many workflow stages are finished (0 to 6), for the status page. */
export function workflowProgress(a: { application_status: ApplicationStatus; meeting_invited_at: string | null; meeting_held_at: string | null }): number {
  switch (a.application_status) {
    case "draft":
    case "more_info":
      return 0;
    case "submitted":
      return 1;
    case "under_verification":
      return 1;
    case "meeting_required":
      return a.meeting_held_at ? 4 : 3;
    case "rejected":
      return 5;
    case "approved":
      return 6;
  }
}

export type VideoStatus = "uploaded" | "submitted" | "under_review" | "changes_required" | "approved" | "rejected" | "replaced";
export const VIDEO_STATUS: Record<VideoStatus | "none", { label: string; tone: string; text: string }> = {
  none: { label: "Not uploaded", tone: "bg-hi text-ink", text: "Your introduction video has not been uploaded yet. Upload a video to continue preparing your public profile." },
  uploaded: { label: "Not submitted", tone: "bg-hi text-ink", text: "Your video is uploaded. Watch it once, then submit it for review." },
  submitted: { label: "Submitted", tone: "bg-info-tint text-info", text: "We have your video. A reviewer will watch it." },
  under_review: { label: "Under review", tone: "bg-info-tint text-info", text: "Your video is under review. We will tell you once a decision has been made." },
  changes_required: { label: "Changes required", tone: "bg-hi text-ink", text: "Please change your video and upload it again." },
  approved: { label: "Approved", tone: "bg-forest-tint text-forest-ink", text: "Your video is approved. It plays on your public profile once the profile is published." },
  rejected: { label: "Rejected", tone: "bg-error-tint text-error", text: "This video was not approved. You can upload a new one." },
  replaced: { label: "Replaced", tone: "bg-sand text-ink-2", text: "A newer video took its place." },
};

export type CredentialKind = "identity" | "education" | "certification" | "licence";
export const CREDENTIAL_KINDS: Record<CredentialKind, string> = {
  identity: "Identity document",
  education: "Educational qualification",
  certification: "Professional certification",
  licence: "Professional licence",
};
export const CREDENTIAL_STATUS: Record<string, { label: string; tone: string }> = {
  submitted: { label: "Waiting for review", tone: "bg-info-tint text-info" },
  approved: { label: "Verified", tone: "bg-forest-tint text-forest-ink" },
  rejected: { label: "Not verified", tone: "bg-error-tint text-error" },
};

// ---------------------------------------------------------------------------
// Choices

export const EXPERIENCE_BANDS = [
  ["under_1", "Less than 1 year"],
  ["1_2", "1 to 2 years"],
  ["3_5", "3 to 5 years"],
  ["6_10", "6 to 10 years"],
  ["over_10", "More than 10 years"],
] as const;

export const EDUCATION_LEVELS = [
  ["secondary", "Secondary school"],
  ["certificate", "Certificate"],
  ["diploma", "Diploma"],
  ["bachelors", "Bachelor's degree"],
  ["masters", "Master's degree"],
  ["doctorate", "Doctorate"],
  ["other", "Other"],
] as const;

export const AUDIENCES = [
  ["school_students", "School students"],
  ["university_students", "University and college students"],
  ["recent_graduates", "Recent graduates"],
  ["working_professionals", "Working professionals"],
  ["entrepreneurs", "Entrepreneurs and business owners"],
  ["teams", "Teams and organisations"],
  ["anyone", "Anyone interested in learning this skill"],
] as const;

export const FORMAT_LABELS: Record<(typeof OFFER_FORMATS)[number], string> = {
  one_to_one: "One-to-one sessions",
  small_group: "Group classes",
  workshop: "Workshops",
  cohort: "Structured programmes",
};

/** Countries offered in the form: East Africa first, then where international experts are likeliest. */
export const COUNTRIES = [
  ["KE", "Kenya"],
  ["UG", "Uganda"],
  ["TZ", "Tanzania"],
  ["RW", "Rwanda"],
  ["BI", "Burundi"],
  ["SS", "South Sudan"],
  ["ET", "Ethiopia"],
  ["SO", "Somalia"],
  ["CD", "DR Congo"],
  ["NG", "Nigeria"],
  ["GH", "Ghana"],
  ["ZA", "South Africa"],
  ["EG", "Egypt"],
  ["ZM", "Zambia"],
  ["ZW", "Zimbabwe"],
  ["MW", "Malawi"],
  ["AE", "United Arab Emirates"],
  ["GB", "United Kingdom"],
  ["US", "United States"],
  ["CA", "Canada"],
  ["DE", "Germany"],
  ["IN", "India"],
  ["TR", "Türkiye"],
  ["AU", "Australia"],
] as const;

const labelOf = (list: readonly (readonly [string, string])[], code: string | null | undefined) => list.find(([c]) => c === code)?.[1] ?? null;
export const countryLabel = (code: string | null | undefined) => labelOf(COUNTRIES, code) ?? code ?? null;
export const experienceLabel = (code: string | null | undefined) => labelOf(EXPERIENCE_BANDS, code);
export const educationLabel = (code: string | null | undefined) => labelOf(EDUCATION_LEVELS, code);
export const audienceLabel = (code: string) => labelOf(AUDIENCES, code) ?? code;
export const languageLabel = (code: string) => labelOf(LANGUAGES, code) ?? code;
export const categoryLabel = (code: string | null | undefined) => CATEGORIES.find((c) => c.code === code)?.label ?? null;

// ---------------------------------------------------------------------------
// Limits

export const BIO_WORDS = { min: 100, max: 250 } as const;
export const ACHIEVEMENT_WORDS = 300;
export const SPECIALISATION_CHARS = 250;
export const OUTCOME_CHARS = 300;

export const PHOTO = { maxBytes: 5 * 1024 * 1024, types: ["image/jpeg", "image/png"], label: "JPG or PNG, up to 5 MB" } as const;
export const DOCUMENT = { maxBytes: 10 * 1024 * 1024, types: ["image/jpeg", "image/png", "application/pdf"], label: "PDF, JPG or PNG, up to 10 MB" } as const;
export const VIDEO = { maxBytes: 200 * 1024 * 1024, types: ["video/mp4", "video/quicktime"], minSeconds: 60, maxSeconds: 180, label: "MP4 or MOV, up to 200 MB, 1 to 3 minutes" } as const;

export function wordCount(text: string | null | undefined): number {
  const t = (text ?? "").trim();
  return t ? t.split(/\s+/).length : 0;
}

/** "Strategy, Bookkeeping; Tax" → up to eight tidy tags. */
export function parseSpecialisations(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,;\n]/)) {
    const s = raw.trim().replace(/\s+/g, " ").slice(0, 40);
    const k = s.toLowerCase();
    if (s.length >= 2 && !seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  }
  return out.slice(0, 8);
}

const httpsUrl = (v: string) => /^https:\/\/[^\s]{8,290}$/.test(v);

/** Any phone number with its country code (+254 712 345 678, 0712 345 678 for Kenya). */
export function normalisePhone(input: string): string | null {
  const v = input.replace(/[\s().-]/g, "");
  if (/^0[17]\d{8}$/.test(v)) return `+254${v.slice(1)}`;
  if (/^\+[1-9]\d{6,14}$/.test(v)) return v;
  if (/^254[17]\d{8}$/.test(v)) return `+${v}`;
  return null;
}

// ---------------------------------------------------------------------------
// The application's fields, step by step

export type Application = {
  display_name: string | null;
  contact_phone: string | null;
  country_code: string | null;
  city: string | null;
  photo_url: string | null;
  headline: string | null;
  bio: string | null;
  education_level: string | null;
  education_field: string | null;
  experience_band: string | null;
  achievements: string | null;
  employment_status: string | null;
  employer: string | null;
  website_url: string | null;
  primary_category: string | null;
  specialisations: string[];
  audiences: string[];
  languages: string[];
  formats_offered: string[];
  learner_outcomes: string | null;
  portfolio_links: string[];
};

type Errors = Record<string, string>;
type Parsed<T> = { values: T; errors: Errors };

export type Step1 = Pick<Application, "display_name" | "contact_phone" | "country_code" | "city">;
export function parseStep1(f: Getter): Parsed<Step1> {
  const errors: Errors = {};
  const name = str(f, "display_name").replace(/\s+/g, " ");
  const phone = normalisePhone(str(f, "contact_phone"));
  const country = str(f, "country_code");
  const city = str(f, "city");
  if (name.length < 5 || !name.includes(" ")) errors.display_name = "Enter your full legal name, as on your ID or passport.";
  else if (name.length > 80) errors.display_name = "Keep it under 80 characters.";
  if (!phone) errors.contact_phone = "Enter your phone number with its country code, for example +254 712 345 678.";
  if (!COUNTRIES.some(([c]) => c === country)) errors.country_code = "Choose your country of residence.";
  if (city.length < 2) errors.city = "Enter the city or town you live in.";
  else if (city.length > 80) errors.city = "Keep it under 80 characters.";
  return { values: { display_name: name, contact_phone: phone, country_code: country || null, city }, errors };
}

export type Step2 = Pick<Application, "headline" | "bio" | "education_level" | "education_field" | "experience_band" | "achievements" | "employment_status" | "employer" | "website_url">;
export function parseStep2(f: Getter): Parsed<Step2> {
  const errors: Errors = {};
  const headline = str(f, "headline");
  const bio = str(f, "bio");
  const level = str(f, "education_level");
  const field = str(f, "education_field");
  const band = str(f, "experience_band");
  const achievements = str(f, "achievements");
  const employment = str(f, "employment_status");
  const employer = str(f, "employer");
  const website = str(f, "website_url");
  if (headline.length < 3) errors.headline = "Enter your professional title, for example Business Consultant.";
  else if (headline.length > 140) errors.headline = "Keep it under 140 characters.";
  const words = wordCount(bio);
  if (words < BIO_WORDS.min) errors.bio = `Write at least ${BIO_WORDS.min} words. You have ${words}.`;
  else if (words > BIO_WORDS.max) errors.bio = `Keep it to ${BIO_WORDS.max} words. You have ${words}.`;
  if (level && !EDUCATION_LEVELS.some(([c]) => c === level)) errors.education_level = "Choose a level from the list.";
  if (field.length > 120) errors.education_field = "Keep it under 120 characters.";
  if (!EXPERIENCE_BANDS.some(([c]) => c === band)) errors.experience_band = "Choose your years of professional experience.";
  if (achievements.length < 20) errors.achievements = "Describe your key roles and achievements.";
  else if (wordCount(achievements) > ACHIEVEMENT_WORDS) errors.achievements = `Keep it to ${ACHIEVEMENT_WORDS} words.`;
  if (!EMPLOYMENT.some(([c]) => c === employment)) errors.employment_status = "Choose your current employment.";
  if (employer.length > 120) errors.employer = "Keep it under 120 characters.";
  if (website && !httpsUrl(website)) errors.website_url = "Use a full address starting with https://";
  return {
    values: {
      headline,
      bio,
      education_level: level || null,
      education_field: field || null,
      experience_band: band || null,
      achievements,
      employment_status: employment || null,
      employer: employer || null,
      website_url: website || null,
    },
    errors,
  };
}

export type Step3 = Pick<Application, "primary_category" | "specialisations" | "audiences" | "languages" | "formats_offered" | "learner_outcomes">;
export function parseStep3(f: Getter): Parsed<Step3> {
  const errors: Errors = {};
  const category = str(f, "primary_category");
  const rawSpec = str(f, "specialisations");
  const specialisations = parseSpecialisations(rawSpec);
  const audiences = all(f, "audiences").filter((a) => AUDIENCES.some(([c]) => c === a));
  const languages = all(f, "languages").filter((l) => LANGUAGES.some(([c]) => c === l));
  const formats = all(f, "formats_offered").filter((x) => (OFFER_FORMATS as readonly string[]).includes(x));
  const outcomes = str(f, "learner_outcomes");
  if (!CATEGORIES.some((c) => c.code === category)) errors.primary_category = "Choose your primary category.";
  if (!specialisations.length) errors.specialisations = "List at least one specialisation, separated by commas.";
  else if (rawSpec.length > SPECIALISATION_CHARS) errors.specialisations = `Keep it under ${SPECIALISATION_CHARS} characters.`;
  if (!audiences.length) errors.audiences = "Choose at least one group you work with.";
  if (!languages.length) errors.languages = "Choose at least one language.";
  if (!formats.length) errors.formats_offered = "Choose at least one format.";
  if (outcomes.length < 20) errors.learner_outcomes = "Say what learners achieve with you.";
  else if (outcomes.length > OUTCOME_CHARS) errors.learner_outcomes = `Keep it under ${OUTCOME_CHARS} characters.`;
  return { values: { primary_category: (category as CategoryCode) || null, specialisations, audiences, languages, formats_offered: formats, learner_outcomes: outcomes }, errors };
}

export function parseLinks(f: Getter): Parsed<{ portfolio_links: string[] }> {
  const links = [...new Set(all(f, "portfolio_links").map((l) => l.trim()).filter(Boolean))].slice(0, 5);
  const bad = links.find((l) => !httpsUrl(l));
  return { values: { portfolio_links: links }, errors: bad ? { portfolio_links: "Use full addresses starting with https://" } : {} };
}

/** Which of the first four steps are complete; step 5 is the review itself. */
export function stepsComplete(a: Application, hasIdentityDocument: boolean): [boolean, boolean, boolean, boolean] {
  const words = wordCount(a.bio);
  return [
    !!(a.display_name && a.contact_phone && a.country_code && a.city && a.photo_url),
    !!(a.headline && words >= BIO_WORDS.min && words <= BIO_WORDS.max && a.experience_band && a.achievements && a.employment_status),
    !!(a.primary_category && a.specialisations.length && a.audiences.length && a.languages.length && a.formats_offered.length && a.learner_outcomes),
    hasIdentityDocument,
  ];
}

/** TSC Code of Conduct s.28(d): full-time TSC teachers may not take other paid work. */
export const blockedByEmployment = (employment: string | null) => employment === "tsc_full_time";

// ---------------------------------------------------------------------------
// Profile completion and publication

/** What the database reports for one expert (private.profile_requirements). */
export type Requirements = {
  approved: boolean;
  photo: boolean;
  basic: boolean;
  biography: boolean;
  background: boolean;
  expertise: boolean;
  video: boolean;
  experience: boolean;
  published: boolean;
};

export const NO_REQUIREMENTS: Requirements = { approved: false, photo: false, basic: false, biography: false, background: false, expertise: false, video: false, experience: false, published: false };

/**
 * Completion counts requirements that are really met, each once: the photo, the three basic details,
 * the biography, the background, the expertise, an approved video and an approved learning
 * experience. Opening a section changes nothing.
 */
export function profileCompletion(r: Requirements): { done: number; total: number; pct: number; items: { key: keyof Requirements; label: string; done: boolean }[] } {
  const items: { key: keyof Requirements; label: string; done: boolean }[] = [
    { key: "photo", label: "Profile photo", done: r.photo },
    { key: "basic", label: "Name, professional title and country", done: r.basic },
    { key: "biography", label: "Biography", done: r.biography },
    { key: "background", label: "Experience and achievements", done: r.background },
    { key: "expertise", label: "Areas of expertise", done: r.expertise },
    { key: "video", label: "Introduction video approved", done: r.video },
    { key: "experience", label: "A learning experience approved", done: r.experience },
  ];
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, pct: Math.round((done / items.length) * 100), items };
}

export const profileInfoComplete = (r: Requirements) => r.basic && r.biography && r.background && r.expertise;
/** Every requirement for publication is met. */
export const canPublish = (r: Requirements) => r.approved && r.photo && profileInfoComplete(r) && r.video && r.experience;

/** Fields an approved expert changes only through review, with the label staff and experts see. */
export const REVIEWED_FIELDS: Record<string, string> = {
  display_name: "Full legal name",
  headline: "Professional title",
  bio: "Biography",
  photo_url: "Profile photo",
  country_code: "Country",
  languages: "Languages of delivery",
  education_level: "Highest level of education",
  education_field: "Field of study",
  experience_band: "Years of experience",
  achievements: "Work experience and achievements",
  primary_category: "Primary category",
  specialisations: "Specialisations",
  audiences: "Who you work with",
  formats_offered: "Formats offered",
  learner_outcomes: "What learners achieve",
};

/** A value as people read it, for the draft and live columns of a review. */
export function showField(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) {
    const list = value.map(String);
    if (key === "audiences") return list.map(audienceLabel).join(", ");
    if (key === "languages") return list.map(languageLabel).join(", ");
    if (key === "formats_offered") return list.map((x) => FORMAT_LABELS[x as keyof typeof FORMAT_LABELS] ?? x).join(", ");
    return list.join(", ");
  }
  const v = String(value);
  if (key === "country_code") return countryLabel(v) ?? v;
  if (key === "experience_band") return experienceLabel(v) ?? v;
  if (key === "education_level") return educationLabel(v) ?? v;
  if (key === "primary_category") return categoryLabel(v) ?? v;
  if (key === "photo_url") return "New photo";
  return v;
}

// ---------------------------------------------------------------------------
// Weekly hours on the public profile

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * [{weekday, starts, ends}] → "Monday to Friday 09:00–17:00". Days with the same hours that follow
 * one another are written as a range. Weekday 0 is Sunday; the week is listed from Monday.
 */
export function groupWeeklyHours(rows: { weekday: number; starts: string; ends: string }[]): { days: string; hours: string }[] {
  const byDay = new Map<number, string[]>();
  for (const r of rows) {
    const list = byDay.get(r.weekday) ?? [];
    list.push(`${r.starts}–${r.ends}`);
    byDay.set(r.weekday, list);
  }
  const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => byDay.has(d));
  const out: { first: number; last: number; hours: string }[] = [];
  for (const d of order) {
    const hours = byDay.get(d)!.sort().join(", ");
    const prev = out.at(-1);
    const follows = prev && (order.indexOf(prev.last) === order.indexOf(d) - 1) && ((prev.last + 1) % 7 === d);
    if (prev && follows && prev.hours === hours) prev.last = d;
    else out.push({ first: d, last: d, hours });
  }
  return out.map((g) => ({ days: g.first === g.last ? DAYS[g.first] : `${DAYS[g.first]} to ${DAYS[g.last]}`, hours: g.hours }));
}
