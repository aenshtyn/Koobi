import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { ExploreOffer, OfferDetails, OfferFilters, PublicReview, PublicTeacher } from "@/domain/types";
import { hasSupabase, useDevSeed } from "@/lib/supabase/config";
import { IN_PERSON_MODES, isInPerson, isOnline } from "@/domain/taxonomy";
import { publicClient } from "@/lib/supabase/public";

/**
 * Public catalogue reads: Explore, category, offer and teacher pages.
 * Reads go through the anon-readable views (explore_offers, offer_details, public_teachers,
 * public_reviews), which only ever contain approved listings. Without Supabase in local
 * development the dev fixtures stand in; in production without Supabase everything is empty.
 */

async function fixtures() {
  return import("./fixtures");
}

function stripDetails<T extends { details: unknown }>(o: T): Omit<T, "details"> {
  const copy: Partial<T> = { ...o };
  delete copy.details;
  return copy as Omit<T, "details">;
}

/** Shared filter and sort semantics, used for fixtures and as the spec for the SQL query. */
export function applyFilters(rows: ExploreOffer[], f: OfferFilters): ExploreOffer[] {
  const q = f.q?.trim().toLowerCase();
  let out = rows.filter((o) => {
    if (f.category && o.category !== f.category) return false;
    if (f.formats?.length && !f.formats.includes(o.format)) return false;
    if (f.mode === "online" && !isOnline(o.modes)) return false;
    if (f.mode === "in_person" && !isInPerson(o.modes)) return false;
    if (f.maxPrice && o.price_kes > f.maxPrice) return false;
    if (q && !`${o.title} ${o.summary} ${o.teacher_name}`.toLowerCase().includes(q)) return false;
    return true;
  });
  out = [...out].sort((a, b) => {
    switch (f.sort) {
      case "price_asc":
        return a.price_kes - b.price_kes;
      case "price_desc":
        return b.price_kes - a.price_kes;
      case "soonest":
        return (a.next_start ?? "9999").localeCompare(b.next_start ?? "9999");
      default:
        // FR-MATCH-5: tier, then rating (unrated after rated), then newest
        return b.rank_tier - a.rank_tier || (b.rating_avg ?? -1) - (a.rating_avg ?? -1) || b.published_at.localeCompare(a.published_at);
    }
  });
  return out;
}

export async function listOffers(filters: OfferFilters = {}): Promise<ExploreOffer[]> {
  "use cache";
  cacheTag("offers");
  cacheLife("minutes");

  if (useDevSeed) {
    const { FIXTURE_OFFERS } = await fixtures();
    return applyFilters(
      FIXTURE_OFFERS.map(stripDetails),
      filters,
    );
  }
  if (!hasSupabase) return [];

  let query = publicClient().from("explore_offers").select("*");
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.formats?.length) query = query.in("format", filters.formats);
  if (filters.mode === "online") query = query.overlaps("modes", ["online", "hybrid"]);
  if (filters.mode === "in_person") query = query.overlaps("modes", IN_PERSON_MODES);
  if (filters.maxPrice) query = query.lte("price_kes", filters.maxPrice);
  if (filters.q?.trim()) {
    const q = filters.q.trim().replace(/[%,()]/g, " ");
    query = query.or(`title.ilike.%${q}%,summary.ilike.%${q}%,teacher_name.ilike.%${q}%`);
  }
  switch (filters.sort) {
    case "price_asc":
      query = query.order("price_kes", { ascending: true });
      break;
    case "price_desc":
      query = query.order("price_kes", { ascending: false });
      break;
    case "soonest":
      query = query.order("next_start", { ascending: true, nullsFirst: false });
      break;
    default:
      query = query
        .order("rank_tier", { ascending: false })
        .order("rating_avg", { ascending: false, nullsFirst: false })
        .order("published_at", { ascending: false });
  }
  const { data, error } = await query.limit(60);
  if (error) throw new Error(`explore_offers: ${error.message}`);
  return (data ?? []) as ExploreOffer[];
}

export type OfferPage = {
  offer: ExploreOffer;
  details: OfferDetails | null;
  teacher: PublicTeacher | null;
  reviews: PublicReview[];
};

export async function getOfferPage(slug: string): Promise<OfferPage | null> {
  "use cache";
  cacheTag("offers", `offer:${slug}`);
  cacheLife("minutes");

  if (useDevSeed) {
    const { FIXTURE_OFFERS, FIXTURE_TEACHERS, FIXTURE_REVIEWS } = await fixtures();
    const found = FIXTURE_OFFERS.find((o) => o.slug === slug);
    if (!found) return null;
    const { details, ...offer } = found;
    return {
      offer,
      details: { id: offer.id, slug: offer.slug, ...details },
      teacher: FIXTURE_TEACHERS.find((t) => t.slug === offer.teacher_slug) ?? null,
      reviews: FIXTURE_REVIEWS.filter((r) => r.offering_id === offer.id),
    };
  }
  if (!hasSupabase) return null;

  const db = publicClient();
  const { data: offer, error } = await db.from("explore_offers").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`explore_offers: ${error.message}`);
  if (!offer) return null;
  const [details, teacher, reviews] = await Promise.all([
    db.from("offer_details").select("*").eq("slug", slug).maybeSingle(),
    db.from("public_teachers").select("*").eq("slug", offer.teacher_slug).maybeSingle(),
    db.from("public_reviews").select("*").eq("offering_id", offer.id).order("created_at", { ascending: false }).limit(12),
  ]);
  return {
    offer: offer as ExploreOffer,
    details: (details.data as OfferDetails | null) ?? null,
    teacher: (teacher.data as PublicTeacher | null) ?? null,
    reviews: (reviews.data as PublicReview[] | null) ?? [],
  };
}

export type TeacherPage = { teacher: PublicTeacher; offers: ExploreOffer[]; reviews: PublicReview[] };

export async function getTeacherPage(slug: string): Promise<TeacherPage | null> {
  "use cache";
  cacheTag("teachers", `teacher:${slug}`);
  cacheLife("minutes");

  if (useDevSeed) {
    const { FIXTURE_OFFERS, FIXTURE_TEACHERS, FIXTURE_REVIEWS } = await fixtures();
    const teacher = FIXTURE_TEACHERS.find((t) => t.slug === slug);
    if (!teacher) return null;
    return {
      teacher,
      offers: FIXTURE_OFFERS.filter((o) => o.teacher_slug === slug).map(stripDetails),
      reviews: FIXTURE_REVIEWS.filter((r) => r.teacher_slug === slug),
    };
  }
  if (!hasSupabase) return null;

  const db = publicClient();
  const { data: teacher, error } = await db.from("public_teachers").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`public_teachers: ${error.message}`);
  if (!teacher) return null;
  const [offers, reviews] = await Promise.all([
    db.from("explore_offers").select("*").eq("teacher_slug", slug),
    db.from("public_reviews").select("*").eq("teacher_slug", slug).order("created_at", { ascending: false }).limit(12),
  ]);
  return {
    teacher: teacher as PublicTeacher,
    offers: (offers.data as ExploreOffer[] | null) ?? [],
    reviews: (reviews.data as PublicReview[] | null) ?? [],
  };
}
