import type { CategoryCode, FormatCode, PriceBasis, TrackCode } from "./taxonomy";

export type Badge = { label: string; passed_at: string };

/** Mirrors the public.explore_offers view (supabase/migrations). */
export type ExploreOffer = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: CategoryCode;
  track: TrackCode;
  format: FormatCode;
  price_kes: number;
  price_basis: PriceBasis;
  duration_minutes: number;
  sessions_in_run: number | null;
  modes: string[];
  county: string | null;
  estate: string | null;
  next_start: string | null;
  seats_left: number | null;
  /** null unless the offer has at least the minimum number of published reviews */
  rating_avg: number | null;
  review_count: number;
  teacher_slug: string;
  teacher_name: string;
  teacher_headline: string;
  teacher_photo_url: string | null;
  badges: Badge[];
  published_at: string;
  rank_tier: number;
};

/** Mirrors public.offer_details. */
export type OfferDetails = {
  id: string;
  slug: string;
  description: string;
  outcomes: string[];
  languages: string[];
  meeting_tool: string | null;
  trial_price_kes: number | null;
  package_prices: { sessions: number; price_kes: number; name?: string; description?: string | null; validity_weeks?: number | null }[] | null;
  next_slots: string[];
};

/** Mirrors public.public_teachers. */
export type PublicTeacher = {
  slug: string;
  display_name: string;
  headline: string;
  bio: string;
  photo_url: string | null;
  languages: string[];
  county: string | null;
  badges: Badge[];
  response_time_minutes: number | null;
  review_count: number;
  rating_avg: number | null;
  member_since: string;
  /** Added by the expert onboarding migration; absent on a database that does not have it yet. */
  country_code?: string | null;
  experience_band?: string | null;
  achievements?: string | null;
  primary_category?: string | null;
  specialisations?: string[];
  audiences?: string[];
  formats_offered?: string[];
  learner_outcomes?: string | null;
  /** The expert's application was approved by Koobi. */
  verified?: boolean;
  /** An approved introduction video exists; it plays from /teachers/[slug]/video. */
  has_video?: boolean;
  /** Qualifications Koobi verified one by one. Identity documents are never here. */
  credentials?: { title: string; kind: "education" | "certification" | "licence"; issuer: string | null }[];
  weekly_hours?: { weekday: number; starts: string; ends: string }[];
};

/** Mirrors public.public_reviews. */
export type PublicReview = {
  offering_id: string;
  teacher_slug: string;
  rating: number;
  body: string;
  created_at: string;
  reviewer_first_name: string;
};

export type OfferSort = "recommended" | "price_asc" | "price_desc" | "soonest";

export type OfferFilters = {
  category?: CategoryCode;
  formats?: FormatCode[];
  mode?: "online" | "in_person";
  q?: string;
  maxPrice?: number;
  sort?: OfferSort;
};
