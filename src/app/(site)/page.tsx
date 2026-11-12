import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Camera } from "lucide-react";
import { CATEGORIES, FORMATS, PUBLIC_FORMATS } from "@/domain/taxonomy";
import { listOffers } from "@/lib/data/catalogue";
import { CategoryCard } from "@/components/site/category-card";
import { OfferCard } from "@/components/site/offer-card";
import { OfferGridSkeleton } from "@/components/site/skeletons";
import { SearchForm } from "@/components/site/search-form";
import { ExpertBand, HowItWorks, PromisesBand, RequestCard } from "@/components/site/sections";
import { Bulb, Plant, Spark } from "@/components/ui/doodles";
import { Seal } from "@/components/ui/trust";

const POPULAR = ["Business English", "Marketing", "Excel", "KCSE Mathematics", "Interview"];

export default function HomePage() {
  return (
    <>
      <section className="page-wrap flex flex-wrap items-center gap-12 pt-9 pb-[76px]" aria-labelledby="hero-h">
        <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-5">
          <h1 id="hero-h" className="d1">
            Learn from people
            <br className="hide-sm" /> who have actually
            <br /> <span className="swash">done it.</span>
          </h1>
          <p className="lead max-w-[540px] font-semibold text-ink!">Find teachers and experts with verified experience.</p>
          <p className="lead max-w-[540px]">
            Learn through live one-to-one lessons, group classes, workshops and structured programmes—all in one place.
          </p>
          <div className="mt-1 flex flex-col gap-3.5">
            <SearchForm id="hero-q" />
            <div className="flex flex-wrap items-center gap-2">
              <Spark className="spark sm" style={{ transform: "rotate(-20deg)" }} />
              <span className="hand4 mr-1 text-[18px] leading-[22px] text-ink-2">Popular searches</span>
              {POPULAR.map((q) => (
                <Link key={q} className="chip sm" href={`/explore?q=${encodeURIComponent(q)}`}>
                  {q}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="collage flex-[1_1_440px]" aria-hidden="true">
          <Bulb style={{ left: 30, top: 8 }} />
          <div className="ph warm pa">
            <Camera size={28} strokeWidth={1.5} />
          </div>
          <div className="ph green pb">
            <Camera size={28} strokeWidth={1.5} />
          </div>
          <div className="floatcard" style={{ top: 112, left: 0, transform: "rotate(-1.5deg)" }}>
            <span className="inline-flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[12px_14px_11px_15px] bg-forest-tint">
              <Seal className="[--tick:var(--forest-tint)]" size={24} />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">Every check shows its date</span>
              <span className="text-xs text-ink-2">ID, certificates, experience</span>
            </span>
          </div>
          <p className="callout" style={{ top: -18, right: -12 }}>
            Real learning for real goals.
          </p>
          <Spark className="spark dood hide-sm" style={{ right: -24, top: 134, transform: "rotate(100deg)" }} />
          <div className="floatcard r2" style={{ right: 18, bottom: 112, transform: "rotate(1.5deg)" }}>
            <span className="inline-flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[12px_14px_11px_15px] bg-forest-tint">
              <Seal className="[--tick:var(--forest-tint)]" size={24} />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">Held in escrow</span>
              <span className="text-xs text-ink-2">Released when the lesson happens</span>
            </span>
          </div>
          <Plant style={{ right: 2, bottom: 0, width: 62, height: 108 }} />
        </div>
      </section>

      <PromisesBand />

      <section id="categories" className="page-wrap flex flex-col gap-7 pt-20" aria-labelledby="cat-h">
        <div className="sechead">
          <div className="flex min-w-0 items-center gap-3">
            <h2 id="cat-h" className="mk">
              Explore learning <span className="hl">by category</span>
            </h2>
            <Spark className="spark hide-sm" style={{ transform: "rotate(-10deg)" }} />
          </div>
          <Link className="more" href="/explore">
            All learning
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className="cards-grid">
          {CATEGORIES.map((c, i) => (
            <CategoryCard key={c.code} category={c} index={i} />
          ))}
        </div>
      </section>

      <section className="page-wrap flex flex-col gap-7 pt-[88px]" aria-labelledby="feat-h">
        <div className="sechead">
          <div className="flex min-w-0 flex-col gap-3.5">
            <h2 id="feat-h" className="mk">
              Featured <span className="hl t2">learning experiences</span>
            </h2>
            <nav aria-label="Formats" className="flex flex-wrap gap-2">
              {PUBLIC_FORMATS.map((f) => (
                <Link key={f} className={`tag lg ${FORMATS[f].tagClass}`} href={`/explore?format=${f}`}>
                  {FORMATS[f].label}
                </Link>
              ))}
            </nav>
          </div>
          <Link className="more" href="/explore">
            See all learning experiences
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <Suspense fallback={<OfferGridSkeleton />}>
          <FeaturedOffers />
        </Suspense>
      </section>

      <div className="page-wrap pt-24">
        <HowItWorks />
      </div>

      <section className="page-wrap flex flex-wrap items-stretch gap-6 pt-[88px] pb-[100px]" aria-label="Request a match, and teaching">
        <RequestCard />
        <ExpertBand />
      </section>
    </>
  );
}

async function FeaturedOffers() {
  const offers = (await listOffers({})).slice(0, 4);
  if (!offers.length) {
    return (
      <div className="empty">
        <p className="h5">The first learning experiences are in review.</p>
        <p className="text-ink-2">
          Every teacher and expert is checked before their learning experiences appear here. Tell us what you need and a person will match
          you in the meantime.
        </p>
        <Link className="opill" href="/request">
          Request a match
        </Link>
      </div>
    );
  }
  return (
    <div className="cards-grid">
      {offers.map((o, i) => (
        <OfferCard key={o.id} offer={o} index={i} />
      ))}
    </div>
  );
}
