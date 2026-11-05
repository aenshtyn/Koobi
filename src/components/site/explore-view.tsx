import Link from "next/link";
import { ChevronRight, Search, X } from "lucide-react";
import type { OfferFilters, OfferSort } from "@/domain/types";
import { CATEGORIES, FORMATS, PUBLIC_FORMATS, isFormatCode, type Category } from "@/domain/taxonomy";
import { formatKES } from "@/domain/format";
import { listOffers } from "@/lib/data/catalogue";
import { OfferCard } from "./offer-card";
import { Spark } from "@/components/ui/doodles";
import { Seal } from "@/components/ui/trust";

type Search = Record<string, string | string[] | undefined>;

const PRICE_CAPS = [1000, 2000, 5000, 15000];
const SORTS: { value: OfferSort; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "soonest", label: "Soonest" },
  { value: "price_asc", label: "Price, low to high" },
  { value: "price_desc", label: "Price, high to low" },
];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

export function parseFilters(sp: Search, category?: Category): OfferFilters {
  const mode = one(sp.mode);
  const sort = one(sp.sort) as OfferSort | undefined;
  const max = Number(one(sp.max));
  return {
    category: category?.code,
    q: one(sp.q)?.slice(0, 80) || undefined,
    formats: many(sp.format).filter(isFormatCode),
    mode: mode === "online" || mode === "in_person" ? mode : undefined,
    maxPrice: PRICE_CAPS.includes(max) ? max : undefined,
    sort: SORTS.some((s) => s.value === sort) ? sort : "recommended",
  };
}

/** Header for Explore and category pages: static, prerendered into the shell. */
export function ExploreHeader({ category }: { category?: Category }) {
  return (
    <section className="page-wrap flex flex-col gap-[18px] pt-5 pb-10" aria-labelledby="explore-h">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <ChevronRight size={16} aria-hidden="true" />
        {category ? (
          <>
            <Link href="/explore">Explore</Link>
            <ChevronRight size={16} aria-hidden="true" />
            <span aria-current="page" className="text-ink">
              {category.label}
            </span>
          </>
        ) : (
          <span aria-current="page" className="text-ink">
            Explore
          </span>
        )}
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-3">
          <div className="flex items-center gap-[18px]">
            {category ? (
              <span className={`num lg ${category.numClass}`} aria-hidden="true">
                {category.number}
              </span>
            ) : null}
            <h1 id="explore-h" className="dpage">
              {category ? category.label : "Explore learning"}
            </h1>
            <Spark className="spark hide-md self-start" style={{ transform: "rotate(10deg)" }} />
          </div>
          <p className="lead">
            {category
              ? category.description
              : "Lessons, group classes, workshops and programmes from teachers and experts whose checks you can see."}
          </p>
        </div>
      </div>
      <nav aria-label="Categories" className="flex flex-wrap gap-2">
        <Link className={`chip sm${category ? "" : " on"}`} href="/explore">
          All
        </Link>
        {CATEGORIES.map((c) => (
          <Link key={c.code} className={`chip sm${category?.code === c.code ? " on" : ""}`} href={`/explore/${c.slug}`}>
            {c.short}
          </Link>
        ))}
      </nav>
    </section>
  );
}

/** Filters and results: reads searchParams, so it renders behind a Suspense boundary. */
export async function ExploreResults({ searchParams, category }: { searchParams: Promise<Search>; category?: Category }) {
  const sp = await searchParams;
  const f = parseFilters(sp, category);
  const offers = await listOffers(f);
  const action = category ? `/explore/${category.slug}` : "/explore";
  const active: { label: string; href: string }[] = [];
  /** URL for the current filters with one value removed. */
  const qs = (omit: string, value?: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) for (const x of many(v)) if (!(k === omit && (value === undefined || x === value))) p.append(k, x);
    const s = p.toString();
    return s ? `${action}?${s}` : action;
  };
  if (f.q) active.push({ label: `“${f.q}”`, href: qs("q") });
  for (const fm of f.formats ?? []) active.push({ label: FORMATS[fm].label, href: qs("format", fm) });
  if (f.mode) active.push({ label: f.mode === "online" ? "Online" : "In person", href: qs("mode") });
  if (f.maxPrice) active.push({ label: `Up to ${formatKES(f.maxPrice)}`, href: qs("max") });

  const requestHref = `/request?${new URLSearchParams({
    ...(category ? { category: category.slug } : {}),
    ...(f.q ? { q: f.q } : {}),
  }).toString()}`;

  return (
    <div className="page-wrap flex flex-wrap items-start gap-8 pb-24">
      <aside className="card r3 min-w-0 flex-[1_1_264px] p-[22px] lg:sticky lg:top-6" aria-labelledby="flt-h">
        <form action={action} className="flex flex-col">
          <div className="flex items-center justify-between gap-3">
            <h2 id="flt-h" className="mk sm">
              <span className="hl">Filters</span>
            </h2>
            <Link className="btn3 text-sm" href={action}>
              Clear all
            </Link>
          </div>
          <div className="search sm mt-4">
            <Search size={20} aria-hidden="true" />
            <label className="sr-only" htmlFor="filter-q">
              What do you want to learn?
            </label>
            <input id="filter-q" name="q" type="search" placeholder="What do you want to learn?" defaultValue={f.q ?? ""} />
          </div>
          <fieldset className="fgroup">
            <legend className="sr-only">Format</legend>
            <span className="fhd" aria-hidden="true">
              Format
            </span>
            {PUBLIC_FORMATS.map((fm) => (
              <label key={fm} className="check">
                <input type="checkbox" name="format" value={fm} defaultChecked={f.formats?.includes(fm)} />
                <span className={`tag ${FORMATS[fm].tagClass}`}>{FORMATS[fm].label}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="fgroup">
            <legend className="sr-only">Where</legend>
            <span className="fhd" aria-hidden="true">
              Where
            </span>
            {[
              ["", "Online or in person"],
              ["online", "Online"],
              ["in_person", "In person"],
            ].map(([v, l]) => (
              <label key={v} className="check">
                <input type="radio" name="mode" value={v} defaultChecked={(f.mode ?? "") === v} />
                {l}
              </label>
            ))}
          </fieldset>
          <div className="fgroup">
            <label className="fhd" htmlFor="max">
              Price
            </label>
            <span className="sel block">
              <select id="max" name="max" className="select" defaultValue={f.maxPrice ?? ""}>
                <option value="">Any price</option>
                {PRICE_CAPS.map((c) => (
                  <option key={c} value={c}>
                    Up to {formatKES(c)}
                  </option>
                ))}
              </select>
            </span>
          </div>
          <div className="fgroup">
            <label className="fhd" htmlFor="sort">
              Sort
            </label>
            <span className="sel block">
              <select id="sort" name="sort" className="select" defaultValue={f.sort}>
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </span>
          </div>
          <button type="submit" className="btn2 block mt-5">
            Show results
          </button>
        </form>
        <div className="panel escrow mt-5">
          <Seal />
          <p>
            <b>Checks you can see.</b> Every card shows the checks its teacher or expert passed, with the date.
          </p>
        </div>
      </aside>

      <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-[22px]" aria-labelledby="results-h">
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
          <div className="flex flex-wrap items-center gap-3.5">
            <h2 id="results-h" className="mk md">
              <span className="mono text-[27px] tracking-[-0.03em]">{offers.length}</span>{" "}
              <span className="hl t2">{offers.length === 1 ? "learning offer" : "learning offers"}</span>
            </h2>
            {active.map((a) => (
              <Link key={a.label} className="chip sm on" href={a.href} aria-label={`Remove filter: ${a.label}`}>
                {a.label}
                <X size={15} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>

        {offers.length ? (
          <div className="cards-grid">
            {offers.map((o, i) => (
              <OfferCard key={o.id} offer={o} index={i} />
            ))}
          </div>
        ) : null}

        {offers.length < 3 ? (
          <div className="empty">
            <p className="h5">{offers.length ? "Only a few offers match." : "Nothing matches yet."}</p>
            <p className="text-ink-2">
              Tell us what you need and a person will find you three teachers or experts within 24 hours. Every one of them
              is checked first.
            </p>
            <Link className="opill" href={requestHref}>
              Request a match
            </Link>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function ExploreResultsSkeleton() {
  return (
    <div className="page-wrap flex flex-wrap items-start gap-8 pb-24">
      <div className="skeleton min-w-0 flex-[1_1_264px] h-[640px]" />
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
        <div className="skeleton h-10 w-60" />
        <div className="cards-grid">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton h-[420px]" />
          ))}
        </div>
      </div>
    </div>
  );
}
