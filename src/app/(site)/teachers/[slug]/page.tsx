import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CalendarDays, ChevronRight, Languages, MapPin, ShieldCheck, Timer } from "lucide-react";
import { formatDate, initials } from "@/domain/format";
import { getTeacherPage } from "@/lib/data/catalogue";
import { OfferCard, Rating, avatarTone } from "@/components/site/offer-card";
import { BlockSkeleton } from "@/components/site/skeletons";
import { CheckLedger } from "@/components/ui/trust";
import { Spark } from "@/components/ui/doodles";

export async function generateMetadata(props: PageProps<"/teachers/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const data = await getTeacherPage(slug);
  return data ? { title: data.teacher.display_name, description: data.teacher.headline } : { title: "Profile not found" };
}

export default function TeacherPage(props: PageProps<"/teachers/[slug]">) {
  return (
    <Suspense
      fallback={
        <div className="page-wrap flex flex-col gap-6 pt-4 pb-24">
          <BlockSkeleton className="h-[220px]" />
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
  const data = await getTeacherPage(slug);
  if (!data) notFound();
  const { teacher, offers, reviews } = data;
  const first = teacher.display_name.split(" ")[0];

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

      <div className="page-wrap flex flex-wrap items-start gap-x-12 gap-y-10 pb-24">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-11">
          <section className="flex flex-wrap items-start gap-6" aria-labelledby="t-h">
            <span className={`av lg h-[104px]! w-[104px]! text-[34px]! ${avatarTone(teacher.slug)}`} aria-hidden="true">
              {initials(teacher.display_name)}
            </span>
            <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3">
              <div className="flex items-start gap-2.5">
                <h1 id="t-h" className="dpage">
                  {teacher.display_name}
                </h1>
                <Spark className="spark hide-md flex-none" />
              </div>
              <p className="lead">{teacher.headline}</p>
              <div className="flex flex-wrap gap-2">
                <span className="pill">
                  <Rating rating={teacher.rating_avg} count={teacher.review_count} />
                </span>
                {teacher.county ? (
                  <span className="pill">
                    <MapPin size={16} aria-hidden="true" />
                    {teacher.county}
                  </span>
                ) : null}
                {teacher.languages.length ? (
                  <span className="pill">
                    <Languages size={16} aria-hidden="true" />
                    {teacher.languages.join(", ")}
                  </span>
                ) : null}
                <span className="pill">
                  <CalendarDays size={16} aria-hidden="true" />
                  Joined <span className="mono">{formatDate(teacher.member_since)}</span>
                </span>
                {teacher.response_time_minutes !== null ? (
                  <span className="pill">
                    <Timer size={16} aria-hidden="true" />
                    Replies in about <span className="mono">{Math.max(1, Math.round(teacher.response_time_minutes / 60))}</span> h
                  </span>
                ) : null}
              </div>
            </div>
          </section>

          {teacher.bio ? (
            <section className="flex flex-col gap-4" aria-labelledby="bio-h">
              <h2 id="bio-h" className="mk md">
                What {first} <span className="hl">has done</span>
              </h2>
              <p className="max-w-[68ch] text-[17px] leading-[27px]">{teacher.bio}</p>
            </section>
          ) : null}

          <section className="flex flex-col gap-4" aria-labelledby="offers-h">
            <h2 id="offers-h" className="mk md">
              Learn with <span className="hl t2">{first}</span>
            </h2>
            {offers.length ? (
              <div className="cards-grid">
                {offers.map((o, i) => (
                  <OfferCard key={o.id} offer={o} index={i} />
                ))}
              </div>
            ) : (
              <p className="text-ink-2">No learning experiences are open right now.</p>
            )}
          </section>

          <section className="flex flex-col gap-4" aria-labelledby="rev-h">
            <h2 id="rev-h" className="mk md">
              <span className="hl">Reviews</span>
            </h2>
            {teacher.rating_avg !== null && reviews.length ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                {reviews.slice(0, 6).map((r, i) => (
                  <figure key={`${r.created_at}-${i}`} className={`card ${["", "r2", "r3"][i % 3]} flex flex-col gap-3 p-5`}>
                    <blockquote className="text-[15px] leading-[22px]">{r.body}</blockquote>
                    <figcaption className="mt-auto text-sm">
                      <span className="font-semibold">{r.reviewer_first_name}</span>
                      <span className="mono text-xs text-ink-2"> · {formatDate(r.created_at)}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="text-ink-2">Reviews appear here only from learners who completed a paid lesson.</p>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4 lg:sticky lg:top-6" aria-label="Checks">
          <div className="card r2 flex flex-col gap-4 p-6">
            <h2 className="h4">Checks passed</h2>
            <CheckLedger badges={teacher.badges} />
            <p className="text-sm text-ink-2">
              Phone numbers stay private. You can message {first} after booking, and numbers stay masked until the
              first paid lesson.
            </p>
          </div>
          <div className="panel items-center">
            <ShieldCheck size={22} aria-hidden="true" className="text-forest" />
            <p>
              Something wrong with this profile? <Link href="/help">Tell us</Link>.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
