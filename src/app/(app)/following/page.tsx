import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Search, Tags, Users } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { FollowButton } from "@/components/app/follow-button";
import { getFollowing, type Followed } from "@/lib/data/learning";
import { formatDate, initials } from "@/domain/format";
import { FORMATS, categoryByCode, isFormatCode } from "@/domain/taxonomy";

export const metadata: Metadata = { title: "Following" };

const TABS = [
  ["all", "All experts"],
  ["recent", "Recently followed"],
  ["new", "New updates"],
] as const;
type Tab = (typeof TABS)[number][0];
const DAY = 86_400_000;
const RECENT_DAYS = 30;

/** Following: the experts a learner keeps up with, and what is new from each. */
export default function FollowingPage(props: PageProps<"/following">) {
  return (
    <Guarded next="/following">
      <Following searchParams={props.searchParams} />
    </Guarded>
  );
}

/** Something published after the follow began, and in the last thirty days. */
const isNew = (f: Followed, now: number) => !!f.latest_at && f.latest_at > f.followed_at && now - new Date(f.latest_at).getTime() < RECENT_DAYS * DAY;

function Card({ f, now }: { f: Followed; now: number }) {
  const cats = f.categories.map((c) => categoryByCode(c)?.short).filter(Boolean).join(", ");
  return (
    <li className="card flex flex-col gap-3 p-5">
      <div className="flex items-start gap-3.5">
        <span className="av lg" aria-hidden="true">
          {initials(f.display_name)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="t3">{f.display_name}</h2>
            {isNew(f, now) ? (
              <span className="pill bg-forest-tint text-forest-ink">
                <span className="h-2 w-2 rounded-full bg-forest" aria-hidden="true" />
                New experience
              </span>
            ) : null}
          </div>
          {f.headline ? <p className="text-[15px] leading-[22px] text-ink-2">{f.headline}</p> : null}
          {cats ? (
            <p className="flex items-center gap-1.5 text-[14px] leading-5">
              <Tags size={15} aria-hidden="true" className="flex-none text-ink-2" />
              {cats}
            </p>
          ) : null}
        </div>
      </div>
      {f.visible && f.latest_title && f.latest_slug ? (
        <Link href={`/offers/${f.latest_slug}`} className="flex items-start gap-2 rounded-[12px] bg-sand px-3 py-2 text-[14px] leading-5 text-ink no-underline hover:bg-orange-wash">
          <BookOpen size={16} aria-hidden="true" className="mt-0.5 flex-none text-ink-2" />
          <span>
            Latest: <span className="font-semibold">{f.latest_title}</span>
            {f.latest_format && isFormatCode(f.latest_format) ? ` · ${FORMATS[f.latest_format].label}` : ""}
            {f.experiences > 1 ? (
              <>
                {" "}
                · <span className="mono">{f.experiences}</span> learning experiences
              </>
            ) : null}
          </span>
        </Link>
      ) : (
        <p className="rounded-[12px] bg-sand px-3 py-2 text-[14px] leading-5 text-ink-2">{f.visible ? "No learning experiences open right now." : "Not taking bookings on Koobi right now."}</p>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13.5px] leading-5 text-ink-2">
          Following since <span className="mono">{formatDate(f.followed_at)}</span>
        </span>
        <span className="flex flex-wrap gap-2">
          {f.visible ? (
            <Link className="btn2" href={`/teachers/${f.slug}`}>
              View profile
            </Link>
          ) : null}
          <FollowButton slug={f.slug} name={f.display_name} known />
        </span>
      </div>
    </li>
  );
}

async function Following({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, { ready, items }] = await Promise.all([searchParams, getFollowing()]);
  const now = new Date().getTime();
  const tab: Tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as Tab) : "all";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const needle = q.toLowerCase();
  const shown = items
    .filter((f) => (tab === "recent" ? now - new Date(f.followed_at).getTime() < RECENT_DAYS * DAY : tab === "new" ? isNew(f, now) : true))
    .filter((f) => !needle || `${f.display_name} ${f.headline ?? ""} ${f.latest_title ?? ""} ${f.categories.map((c) => categoryByCode(c)?.label ?? "").join(" ")}`.toLowerCase().includes(needle));
  const href = (t: Tab) => {
    const p = new URLSearchParams({ ...(t !== "all" ? { tab: t } : {}), ...(q ? { q } : {}) });
    return `/following${p.size ? `?${p}` : ""}`;
  };
  return (
    <div className="flex max-w-[1080px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="t1">Following</h1>
        <p className="text-ink-2">Stay connected with experts and keep up with what they add. Updates arrive under the bell.</p>
      </div>
      {!ready ? (
        <p className="panel info" role="status">
          Following is being switched on. You will be able to follow experts here shortly.
        </p>
      ) : null}
      {items.length ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap gap-2" aria-label="Filter">
            {TABS.map(([k, label]) => (
              <Link key={k} className={`chip sm${tab === k ? " on" : ""}`} href={href(k)} aria-current={tab === k ? "page" : undefined}>
                {label}
              </Link>
            ))}
          </nav>
          <form className="relative w-full max-w-[340px]" role="search">
            {tab !== "all" ? <input type="hidden" name="tab" value={tab} /> : null}
            <label className="sr-only" htmlFor="fq">
              Search the experts you follow
            </label>
            <Search size={18} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-2" />
            <input id="fq" name="q" className="input pl-10!" defaultValue={q} placeholder="Search by name, subject or skill" />
          </form>
        </div>
      ) : null}
      {shown.length ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {shown.map((f) => (
            <Card key={f.slug} f={f} now={now} />
          ))}
        </ul>
      ) : items.length ? (
        <div className="empty">
          <Users size={24} aria-hidden="true" />
          <p className="font-semibold">{tab === "new" ? "Nothing new from the experts you follow." : "Nobody matches."}</p>
          <Link className="btn3" href="/following">
            Show everyone you follow
          </Link>
        </div>
      ) : ready ? (
        <div className="empty">
          <Users size={24} aria-hidden="true" />
          <p className="font-semibold">You are not following any experts yet.</p>
          <p className="help">Follow an expert from their profile to hear when they add a learning experience, new dates or new times.</p>
          <Link className="btn2" href="/explore">
            Explore experts <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
