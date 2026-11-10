import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CircleCheck, Clock, EllipsisVertical, FileText, MonitorPlay, Plus, Presentation, Search, Target, Users } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { ListingPill } from "@/components/app/listing-pill";
import { StatCard } from "@/components/app/stat-card";
import { getMyOffers, getMyTeacher, type MyOffer } from "@/lib/data/listings";
import { getTeachingBookings } from "@/lib/data/bookings";
import { FORMATS, categoryByCode, type FormatCode } from "@/domain/taxonomy";
import { formatKES } from "@/domain/format";
import { sessionPrice } from "@/domain/listing-input";
import { duplicateOffer, setOfferPaused } from "../actions";

export const metadata: Metadata = { title: "Learning Experiences" };

const TABS = [
  ["all", "All experiences"],
  ["approved", "Published"],
  ["pending_review", "In review"],
  ["draft", "Drafts"],
  ["rejected", "Needs changes"],
  ["paused", "Paused"],
] as const;

const DONE: Record<string, string> = {
  paused: "Paused. Learners cannot find or book it until you publish it again.",
  resumed: "Published again.",
  error: "That did not work. Try again.",
};

const FORMAT_ICON = { one_to_one: MonitorPlay, small_group: Users, workshop: Presentation, cohort: Target, site_visit: Target } as const;

/** T11: every learning experience with its status, price and bookings, and what the expert can do with each. */
export default function ExperiencesPage(props: PageProps<"/teach/offers">) {
  return (
    <Guarded next="/teach/offers">
      <Experiences searchParams={props.searchParams} />
    </Guarded>
  );
}

function Menu({ o, slug }: { o: MyOffer; slug: string }) {
  const item = "block w-full rounded-[10px] px-3 py-2 text-left text-[15px] leading-5 font-semibold text-ink no-underline hover:bg-orange-wash cursor-pointer";
  return (
    <details className="relative">
      <summary className="iconbtn ghost list-none [&::-webkit-details-marker]:hidden" aria-label={`Actions for ${o.title}`}>
        <EllipsisVertical size={20} aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-10 mt-1 flex w-60 flex-col rounded-[14px] border-[1.5px] border-ink bg-card p-1.5">
        {o.listing_status === "approved" ? (
          <Link className={item} href={`/offers/${slug}`}>
            View public listing
          </Link>
        ) : null}
        <Link className={item} href={`/teach/offers/${o.id}`}>
          Edit information
        </Link>
        <Link className={item} href={`/teach/offers/${o.id}#price-h`}>
          Change pricing
        </Link>
        <Link className={item} href={o.format === "one_to_one" ? "/teach/availability" : `/teach/runs?experience=${o.id}`}>
          {o.format === "one_to_one" ? "Manage schedule" : "Dates and enrolment"}
        </Link>
        <Link className={item} href={o.format === "one_to_one" ? `/teach/bookings?experience=${o.id}` : `/teach/bookings?format=${o.format}&tab=all&experience=${o.id}`}>
          {o.format === "one_to_one" ? "See bookings" : "See bookings and enrolments"}
        </Link>
        {o.listing_status === "approved" || o.listing_status === "paused" ? (
          <form action={setOfferPaused}>
            <input type="hidden" name="id" value={o.id} />
            <input type="hidden" name="back" value="list" />
            <input type="hidden" name="to" value={o.listing_status === "approved" ? "paused" : "approved"} />
            <button className={item} type="submit">
              {o.listing_status === "approved" ? "Pause (unpublish)" : "Publish again"}
            </button>
          </form>
        ) : null}
        <form action={duplicateOffer}>
          <input type="hidden" name="id" value={o.id} />
          <button className={item} type="submit">
            Duplicate
          </button>
        </form>
      </div>
    </details>
  );
}

async function Experiences({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, teacher] = await Promise.all([searchParams, getMyTeacher()]);
  if (!teacher) {
    return (
      <div className="empty max-w-[560px]">
        <p className="t3">Apply first, then create learning experiences.</p>
        <Link className="btn" href="/teach/apply">
          Apply to teach
        </Link>
      </div>
    );
  }
  const [offers, bookings] = await Promise.all([getMyOffers(teacher.id), getTeachingBookings()]);
  const tab = TABS.some(([k]) => k === sp.status) ? (sp.status as string) : "all";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const count = (s: string) => offers.filter((o) => o.listing_status === s).length;
  const shown = offers.filter((o) => (tab === "all" || o.listing_status === tab) && (!q || `${o.title} ${o.subject_text ?? ""}`.toLowerCase().includes(q)));
  const booked = (id: string) => bookings.filter((b) => b.offering_id === id && !["cancelled", "lapsed"].includes(b.status)).length;
  const tabs = TABS.filter(([k]) => k !== "paused" || count("paused") > 0);
  const href = (k: string) => `/teach/offers${k === "all" && !q ? "" : `?${new URLSearchParams({ ...(k !== "all" ? { status: k } : {}), ...(q ? { q } : {}) })}`}`;
  const done = typeof sp.done === "string" ? DONE[sp.done] : sp.deleted ? "Draft deleted." : undefined;

  return (
    <div className="flex max-w-[1080px] flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="t1">My Learning Experiences</h1>
          <p className="text-ink-2">Create and manage what you teach. Each one is reviewed before it appears on Explore.</p>
        </div>
        <Link className="btn" href="/teach/offers/new">
          <Plus size={18} aria-hidden="true" />
          Create learning experience
        </Link>
      </div>

      {done ? (
        <p className={`panel ${sp.done === "error" ? "error" : "escrow"}`} role="status">
          {done}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={BookOpen} value={offers.length} label="Total" />
        <StatCard icon={CircleCheck} tone="forest" value={count("approved")} label="Published" />
        <StatCard icon={Clock} value={count("pending_review")} label="In review" />
        <StatCard icon={FileText} tone="forest" value={count("draft")} label="Drafts" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
          {tabs.map(([k, label]) => (
            <Link key={k} className={`chip sm${tab === k ? " on" : ""}`} href={href(k)} aria-current={tab === k ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <form className="relative w-full max-w-[300px]" role="search">
          {tab !== "all" ? <input type="hidden" name="status" value={tab} /> : null}
          <label className="sr-only" htmlFor="q">
            Search learning experiences
          </label>
          <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-2" />
          <input id="q" name="q" className="input pl-10!" defaultValue={q} placeholder="Search learning experiences" />
        </form>
      </div>

      {shown.length ? (
        <ul className="flex flex-col gap-3">
          <li className="hidden grid-cols-[minmax(0,1fr)_150px_130px_130px_44px] gap-4 px-5 text-[13px] font-bold text-ink-2 lg:grid" aria-hidden="true">
            <span>Learning experience</span>
            <span>Status</span>
            <span>Price</span>
            <span>Bookings</span>
            <span />
          </li>
          {shown.map((o) => {
            const f = FORMATS[o.format as FormatCode];
            const Icon = FORMAT_ICON[o.format as FormatCode] ?? MonitorPlay;
            const n = booked(o.id);
            return (
              <li key={o.id} className="card grid grid-cols-[minmax(0,1fr)_44px] items-center gap-x-4 gap-y-3 p-4 lg:grid-cols-[minmax(0,1fr)_150px_130px_130px_44px] lg:px-5">
                <div className="flex min-w-0 items-center gap-4">
                  <span className="flex h-14 w-14 flex-none items-center justify-center rounded-[14px] bg-fmt-1 text-orange-deep" aria-hidden="true">
                    <Icon size={26} />
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <Link className="font-semibold text-ink no-underline hover:underline" href={`/teach/offers/${o.id}`}>
                      {o.title}
                    </Link>
                    <span className="help">
                      {f?.label ?? o.format} · {categoryByCode(o.category)?.label}
                    </span>
                    {o.listing_status === "rejected" && o.rejection_reason ? <span className="mt-1 text-[14px] leading-5 text-error">Needs changes: {o.rejection_reason}</span> : null}
                    {o.listing_status === "pending_review" ? <span className="mt-1 text-[14px] leading-5 text-ink-2">Awaiting approval</span> : null}
                  </div>
                </div>
                <div className="order-3 col-span-2 lg:order-none lg:col-span-1">
                  <ListingPill state={o.listing_status} />
                </div>
                <div className="order-4 flex flex-col lg:order-none">
                  {o.price_hour_kes ? (
                    <>
                      <span className="mono font-medium">{formatKES(sessionPrice(o.price_hour_kes, o.duration_minutes))}</span>
                      <span className="help text-[13.5px]!">{f?.unit ?? "/ session"}</span>
                    </>
                  ) : o.price_seat_kes ? (
                    <>
                      <span className="mono font-medium">{formatKES(o.price_seat_kes)}</span>
                      <span className="help text-[13.5px]!">a learner</span>
                    </>
                  ) : (
                    <span className="help">No price yet</span>
                  )}
                </div>
                <div className="order-5 lg:order-none">
                  {n ? (
                    <Link className="inline-flex items-center gap-1.5 text-[15px] text-ink no-underline hover:underline" href={`/teach/bookings?experience=${o.id}`}>
                      <Users size={16} aria-hidden="true" />
                      <span>
                        <span className="mono">{n}</span> {n === 1 ? "booking" : "bookings"}
                      </span>
                    </Link>
                  ) : (
                    <span className="help">None yet</span>
                  )}
                </div>
                <div className="order-2 justify-self-end lg:order-none">
                  <Menu o={o} slug={o.slug} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : offers.length ? (
        <div className="empty">
          <p className="font-semibold">Nothing matches.</p>
          <Link className="btn3" href="/teach/offers">
            Show all
          </Link>
        </div>
      ) : (
        <div className="empty">
          <BookOpen size={24} aria-hidden="true" />
          <p className="t3">Create your first learning experience.</p>
          <p className="help">One learning experience is one thing you teach, at one price. You can have several.</p>
        </div>
      )}
    </div>
  );
}
