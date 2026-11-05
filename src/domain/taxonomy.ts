/**
 * Public categories (navigation), internal tracks (verification, guardian rules) and formats.
 * Codes match the Supabase taxonomy tables (PRD FR-OFF-1). Labels are the only copy source.
 */

export const CATEGORY_CODES = [
  "career_professional_growth",
  "business_entrepreneurship",
  "school_academic",
  "digital_practical_skills",
] as const;
export type CategoryCode = (typeof CATEGORY_CODES)[number];

export type Category = {
  code: CategoryCode;
  slug: string;
  number: string;
  label: string;
  short: string;
  description: string;
  /** numbered marker circle colour on Chora pages */
  numClass: "" | "f" | "a";
  /** internal track a request or offer in this category starts on (PRD §1.1) */
  defaultTrack: "school" | "adults_professional" | "practical";
  icon: "briefcase" | "store" | "book" | "laptop";
  popular: string[];
};

export const CATEGORIES: readonly Category[] = [
  {
    code: "career_professional_growth",
    slug: "career",
    defaultTrack: "adults_professional",
    number: "01",
    label: "Career and professional growth",
    short: "Career",
    description: "Communication, interviews, workplace English and leadership.",
    numClass: "",
    icon: "briefcase",
    popular: ["Business English", "Interview preparation", "Public speaking", "IELTS"],
  },
  {
    code: "business_entrepreneurship",
    slug: "business",
    defaultTrack: "adults_professional",
    number: "02",
    label: "Business and entrepreneurship",
    short: "Business",
    description: "Marketing, sales, bookkeeping and running a small business.",
    numClass: "f",
    icon: "store",
    popular: ["Marketing", "Bookkeeping", "Sales", "Pricing"],
  },
  {
    code: "school_academic",
    slug: "school",
    defaultTrack: "school",
    number: "03",
    label: "School and academic subjects",
    short: "School",
    description: "CBC, KCSE and IGCSE subjects, exam preparation and university courses.",
    numClass: "a",
    icon: "book",
    popular: ["KCSE Mathematics", "IGCSE Chemistry", "CBC Grade 9", "Kiswahili"],
  },
  {
    code: "digital_practical_skills",
    slug: "digital-practical",
    defaultTrack: "adults_professional",
    number: "04",
    label: "Digital and practical skills",
    short: "Digital and practical",
    description: "Excel, design, coding, and hands-on trades and farming.",
    numClass: "f",
    icon: "laptop",
    popular: ["Excel for finance", "Graphic design", "Dairy farming", "Tailoring"],
  },
];

export const TRACK_CODES = ["school", "adults_professional", "practical"] as const;
export type TrackCode = (typeof TRACK_CODES)[number];
export const TRACKS: Record<TrackCode, { label: string; internal: string }> = {
  school: { label: "School", internal: "Shule" },
  adults_professional: { label: "Adults and professionals", internal: "Kazi" },
  practical: { label: "Practical skills", internal: "Ujuzi" },
};

export const FORMAT_CODES = ["one_to_one", "small_group", "workshop", "cohort", "site_visit"] as const;
export type FormatCode = (typeof FORMAT_CODES)[number];
export type PriceBasis = "session" | "seat" | "programme" | "visit";

export const FORMATS: Record<
  FormatCode,
  { label: string; tagClass: "one" | "group" | "work" | "prog"; basis: PriceBasis; unit: string }
> = {
  one_to_one: { label: "One-to-one", tagClass: "one", basis: "session", unit: "/ session" },
  small_group: { label: "Group class", tagClass: "group", basis: "seat", unit: "/ seat" },
  workshop: { label: "Workshop", tagClass: "work", basis: "seat", unit: "/ seat" },
  cohort: { label: "Programme", tagClass: "prog", basis: "programme", unit: "/ programme" },
  site_visit: { label: "Site visit", tagClass: "prog", basis: "visit", unit: "/ visit" },
};

/** Formats shown as public filters (site visits arrive with the practical track). */
export const PUBLIC_FORMATS: FormatCode[] = ["one_to_one", "small_group", "workshop", "cohort"];

export function categoryBySlug(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

export function categoryByCode(code: string): Category | undefined {
  return CATEGORIES.find((c) => c.code === code);
}

export function isFormatCode(v: string): v is FormatCode {
  return (FORMAT_CODES as readonly string[]).includes(v);
}

/** Badge labels say what was checked (IDEA §3). Shown only for passed checks, with the date. */
export const BADGE_LABELS = [
  "ID checked",
  "Certificates checked",
  "TSC checked",
  "Experience checked",
  "Police clearance",
  "Top rated",
] as const;
