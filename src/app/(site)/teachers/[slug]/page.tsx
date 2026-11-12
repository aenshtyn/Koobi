import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, CalendarDays, ChevronRight, MessageCircle, MessagesSquare, ShieldCheck, Star } from "lucide-react";
import { formatDate } from "@/domain/format";
import { getTeacherPage } from "@/lib/data/catalogue";
import { OfferCard } from "@/components/site/offer-card";
import { BlockSkeleton } from "@/components/site/skeletons";
import { FollowButton } from "@/components/app/follow-button";
import { ExpertProfile, type ProfileData } from "@/components/expert/profile-view";

export async function generateMetadata(props: PageProps<"/teachers/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const data = await getTeacherPage(slug);
  return data ? { title: data.teacher.display_name, description: data.teacher.headline } : { title: "Profile not found" };
}

/**
 * The public expert profile. Everything here is approved and published: the profile itself, the
 * introduction video, each verified credential, each learning experience and each review.
 */
export default function TeacherPage(props: PageProps<"/teachers/[slug]">) {
  return (
    <Suspense
      fallback={
        <div className="page-wrap flex flex-col gap-6 pt-4 pb-24">
          <BlockSkeleton className="h-[260px]" />
          <BlockSkeleton className="h-[420px]" />
        </div>
      }
    >
      <Teacher params={props.params} />
    </Suspense>
  );
}

async function Teacher({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getTeacherPage(slug);
  if (!page) notFound();
  const { teacher, offers, reviews } = page;
  const first = teacher.display_name.split(" ")[0];
  const data: ProfileData = {
    name: teacher.display_name,
    title: teacher.headline,
    photoUrl: teacher.photo_url,
    videoSrc: teacher.has_video ? `/teachers/${teacher.slug}/video` : null,
    verified: teacher.verified ?? teacher.badges.length > 0,
    countryCode: teacher.country_code ?? null,
    experienceBand: teacher.experience_band ?? null,
    bio: teacher.bio,
    achievements: teacher.achievements ?? null,
    credentials: teacher.credentials ?? [],
    category: teacher.primary_category ?? null,
    specialisations: teacher.specialisations ?? [],
    audiences: teacher.audiences ?? [],
    languages: teacher.languages,
    outcomes: teacher.learner_outcomes ?? null,
    rating: teacher.rating_avg,
    reviewCount: teacher.review_count,
    weeklyHours: teacher.weekly_hours ?? [],
  };
  const shown = teacher.rating_avg !== null ? reviews.slice(0, 4) : [];

  return (
    <>
      <div className="page-wrap pt-2 pb-5">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/explore">Explore</Link>
          <ChevronRight size={16} aria-hidden="true" />
          <span aria-current="page" className="text-ink">
            {teacher.display_name}
          </span>
        </nav>
      </div>

      <div className="page-wrap pb-24">
        <ExpertProfile
          data={data}
          actions={
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <a className="btn" href="#experiences">
                  <CalendarDays size={18} aria-hidden="true" />
                  Explore learning experiences
                </a>
                <FollowButton slug={teacher.slug} name={teacher.display_name} />
                <Link className="btn2 ink" href="/messages">
                  <MessageCircle size={18} aria-hidden="true" />
                  Message {first}
                </Link>
              </div>
              <p className="text-sm text-ink-2">
                Follow {first} to hear about new learning experiences and times. Messages open once you have booked; phone numbers stay private until the first paid lesson.
              </p>
            </div>
          }
          experiences={
            <section id="experiences" className="flex scroll-mt-24 flex-col gap-4" aria-labelledby="xp-offers">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h2 id="xp-offers" className="mk md">
                  Learning <span className="hl">Experiences</span>
                </h2>
                {offers.length > 3 ? (
                  <Link className="btn3" href={`/explore?q=${encodeURIComponent(teacher.display_name)}`}>
                    View all experiences <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
              {offers.length ? (
                <div className="cards-grid">
                  {offers.slice(0, 6).map((o, i) => (
                    <OfferCard key={o.id} offer={o} index={i} />
                  ))}
                </div>
              ) : (
                <p className="text-ink-2">No learning experiences are open right now.</p>
              )}
            </section>
          }
          reviews={
            <section className="card flex flex-col gap-4 p-5" aria-labelledby="xp-reviews">
              <h2 id="xp-reviews" className="h4 flex items-center gap-2.5">
                <MessagesSquare size={22} aria-hidden="true" className="text-orange" />
                Learner reviews
              </h2>
              {shown.length ? (
                <div className="flex flex-wrap items-start gap-6">
                  <div className="flex flex-none flex-col gap-1">
                    <span className="flex items-center gap-2">
                      <span className="price-xl">{teacher.rating_avg!.toFixed(1)}</span>
                      <Star size={26} aria-hidden="true" className="fill-marker text-marker" />
                    </span>
                    <span className="text-sm text-ink-2">
                      From <span className="mono">{teacher.review_count}</span> approved {teacher.review_count === 1 ? "review" : "reviews"}
                    </span>
                  </div>
                  <ul className="flex min-w-0 flex-[1_1_320px] flex-col">
                    {shown.map((r, i) => (
                      <li key={`${r.created_at}-${i}`} className="flex flex-col gap-1 border-b border-dashed border-line-2 py-3 first:pt-0 last:border-0 last:pb-0">
                        <span className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-semibold">{r.reviewer_first_name}</span>
                          <span className="flex items-center gap-0.5" aria-label={`${r.rating} out of 5`}>
                            {Array.from({ length: 5 }, (_, s) => (
                              <Star key={s} size={14} aria-hidden="true" className={s < r.rating ? "fill-marker text-marker" : "text-line-2"} />
                            ))}
                          </span>
                          <span className="mono text-xs text-ink-2">{formatDate(r.created_at)}</span>
                        </span>
                        <span className="text-[15px] leading-[22px]">{r.body}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-ink-2">Reviews appear here only from learners who completed a paid lesson.</p>
              )}
            </section>
          }
        />
        <div className="panel mt-6 items-center">
          <ShieldCheck size={22} aria-hidden="true" className="text-forest" />
          <p>
            Something wrong with this profile? <Link href="/help">Tell us</Link>.
          </p>
        </div>
      </div>
    </>
  );
}
