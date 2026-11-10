import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CalendarCheck, CalendarDays, CircleCheck, CircleX, Clock, Hourglass, Search, UserRound } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { StatCard } from "@/components/app/stat-card";
import { getLearnerBookings, getOpenReschedules, type LearnerBooking } from "@/lib/data/learning";
import { FORMAT_PLURALS, LEARNER_MODES, type LearnerGroup } from "@/domain/learning";
import { formatDate, formatDuration, formatTime } from "@/domain/format";
import { dayKey, weekOf } from "@/domain/schedule";
import { isFormatCode } from "@/domain/taxonomy";
import { BookingActions, DoneBanner, FormatTag, StatusPill, paid } from "./booking-bits";

export const metadata: Metadata = { title: "My Bookings" };

const TABS = [
  ["upcoming", "Upcoming"],
  ["pending", "Pending"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
  ["all", "All bookings"],
] as const;
type Tab = (typeof TABS)[number][0];
const WHEN = [
  ["", "Any date"],
  ["week", "This week"],
  ["month", "This month"],
] as const;

/** My Bookings: every session, class, workshop and programme the learner has booked, managed from the list. */
export default function BookingsPage(props: PageProps<"/bookings">) {
  return (
    <Guarded next="/bookings">
      <Bookings searchParams={props.searchParams} />
    </Guarded>
  );
}

function Row({ b, now, moves, named }: { b: LearnerBooking; now: number; moves: Awaited<ReturnType<typeof getOpenReschedules>>; named: boolean }) {
  const sessions = b.seat?.sessions.length ?? 0;
  return (
    <li className="card grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_auto_230px] lg:items-start lg:gap-5">
      <div className="flex items-start gap-3.5">
        <span className="flex h-14 w-14 flex-none items-center justify-center rounded-[14px] bg-fmt-1 text-orange-deep" aria-hidden="true">
          <BookOpen size={24} />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Link href={`/learning/${b.offering_id}`} className="font-semibold text-ink no-underline hover:underline">
            {b.title}
          </Link>
          <span className="flex items-center gap-1.5 text-[15px] text-ink-2">
            <UserRound size={15} aria-hidden="true" className="flex-none" />
            {b.teacher_name}
            {named ? ` · for ${b.learner_alias}` : ""}
          </span>
          <span className="flex flex-wrap gap-1.5">
            <FormatTag format={b.format} />
            {b.kind === "trial" ? <span className="pill h-[26px]! bg-fmt-1 px-2.5! text-[13px]! text-orange-deep">Trial session</span> : null}
          </span>
        </div>
      </div>
      <ul className="flex flex-col gap-1.5 text-[15px] leading-[22px]">
        <li>
          <StatusPill b={b} />
        </li>
        <li className="flex items-center gap-2">
          <CalendarDays size={16} aria-hidden="true" className="flex-none text-ink-2" />
          <span className="mono">{formatDate(b.when)}</span>
        </li>
        <li className="flex items-center gap-2">
          <Clock size={16} aria-hidden="true" className="flex-none text-ink-2" />
          <span>
            <span className="mono">
              {formatTime(b.when)} – {formatTime(b.ends)}
            </span>{" "}
            · {LEARNER_MODES[b.mode] ?? b.mode}
          </span>
        </li>
        <li className="flex items-center gap-2">
          <Hourglass size={16} aria-hidden="true" className="flex-none text-ink-2" />
          {sessions > 1 ? (
            <span>
              <span className="mono">{sessions}</span> sessions · {formatDuration(b.duration_minutes)} each
            </span>
          ) : (
            formatDuration(b.duration_minutes)
          )}
        </li>
      </ul>
      <div className="mono text-[17px] lg:pt-0.5 lg:text-right">{paid(b)}</div>
      <BookingActions b={b} at={b.when} ends={b.ends} now={now} back="/bookings" moves={moves} />
    </li>
  );
}

async function Bookings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, all, moves] = await Promise.all([searchParams, getLearnerBookings(), getOpenReschedules()]);
  const now = new Date();
  const tab: Tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as Tab) : "upcoming";
  const format = typeof sp.format === "string" && isFormatCode(sp.format) ? sp.format : null;
  const when = WHEN.some(([k]) => k === sp.when) ? (sp.when as (typeof WHEN)[number][0]) : "";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const needle = q.toLowerCase();
  const week = weekOf(dayKey(now));
  const month = dayKey(now).slice(0, 7);

  const count = (g: LearnerGroup) => all.filter((b) => b.group === g).length;
  const thisWeek = all.filter((b) => b.group === "upcoming" && week.includes(dayKey(b.when))).length;
  const shown = all
    .filter((b) => tab === "all" || b.group === tab)
    .filter((b) => !format || b.format === format)
    .filter((b) => !needle || `${b.title} ${b.teacher_name} ${b.learner_alias}`.toLowerCase().includes(needle))
    .filter((b) => (when === "week" ? week.includes(dayKey(b.when)) : when === "month" ? dayKey(b.when).startsWith(month) : true))
    .sort((a, b) => (tab === "upcoming" || tab === "pending" ? a.when.localeCompare(b.when) : b.when.localeCompare(a.when)));

  const href = (o: { tab?: Tab; format?: string | null; when?: string }) => {
    const t = o.tab ?? tab;
    const f = o.format === undefined ? format : o.format;
    const w = o.when ?? when;
    const p = new URLSearchParams({ ...(t !== "upcoming" ? { tab: t } : {}), ...(f ? { format: f } : {}), ...(w ? { when: w } : {}), ...(q ? { q } : {}) });
    return `/bookings${p.size ? `?${p}` : ""}`;
  };
  const tabLabel = TABS.find(([k]) => k === tab)![1];
  const filtered = !!(format || when || q);
  // Say who a booking is for only when this account books for more than one learner.
  const named = new Set(all.map((b) => b.learner_alias)).size > 1;

  return (
    <div className="flex max-w-[1180px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="t1">My Bookings</h1>
        <p className="text-ink-2">Manage your sessions, classes, workshops and programme enrolments.</p>
      </div>
      <DoneBanner code={sp.done} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={CalendarCheck} value={count("upcoming")} label="Upcoming" sub={thisWeek ? `${thisWeek} this week` : "Confirmed bookings"} href={href({ tab: "upcoming", format: null, when: "" })} />
        <StatCard icon={Clock} tone="sand" value={count("pending")} label="Pending" sub="Waiting for payment or an answer" href={href({ tab: "pending", format: null, when: "" })} />
        <StatCard icon={CircleCheck} tone="forest" value={count("completed")} label="Completed" sub="Past bookings" href={href({ tab: "completed", format: null, when: "" })} />
        <StatCard icon={CircleX} tone="sand" value={count("cancelled")} label="Cancelled" sub="Cancelled bookings" href={href({ tab: "cancelled", format: null, when: "" })} />
      </div>

      <div className="flex flex-col gap-3">
        <nav className="flex flex-wrap items-center gap-2" aria-label="Filter by status">
          {TABS.map(([k, label]) => (
            <Link key={k} className={`chip sm${tab === k ? " on" : ""}`} href={href({ tab: k })} aria-current={tab === k ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <nav className="flex flex-wrap items-center gap-2" aria-label="Filter by learning format">
          <Link className={`chip sm${!format ? " on" : ""}`} href={href({ format: null })} aria-current={!format ? "true" : undefined}>
            All formats
          </Link>
          {FORMAT_PLURALS.map(([f, label]) => (
            <Link key={f} className={`chip sm${format === f ? " on" : ""}`} href={href({ format: f })} aria-current={format === f ? "true" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <form className="flex flex-wrap items-center gap-2" role="search">
          {tab !== "upcoming" ? <input type="hidden" name="tab" value={tab} /> : null}
          {format ? <input type="hidden" name="format" value={format} /> : null}
          <div className="relative min-w-[220px] flex-1">
            <label className="sr-only" htmlFor="q">
              Search by expert or learning experience
            </label>
            <Search size={18} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-2" />
            <input id="q" name="q" className="input pl-10!" defaultValue={q} placeholder="Search by expert or learning experience" />
          </div>
          <label className="sr-only" htmlFor="when">
            Filter by date
          </label>
          <span className="sel">
            <select id="when" name="when" className="select h-[50px]!" defaultValue={when}>
              {WHEN.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </span>
          <button className="btn2 ink h-[50px]!" type="submit">
            Show
          </button>
          {filtered ? (
            <Link className="btn3" href={tab === "upcoming" ? "/bookings" : `/bookings?tab=${tab}`}>
              Clear filters
            </Link>
          ) : null}
        </form>
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="list-h">
        <h2 id="list-h" className="t3">
          {tab === "all" ? "All bookings" : `${tabLabel} bookings`} <span className="mono font-normal text-ink-2">({shown.length})</span>
        </h2>
        {shown.length ? (
          <ul className="flex flex-col gap-3">
            {shown.map((b) => (
              <Row key={b.id} b={b} now={now.getTime()} moves={moves} named={named} />
            ))}
          </ul>
        ) : (
          <div className="empty">
            <CalendarDays size={24} aria-hidden="true" />
            <p className="font-semibold">{all.length ? `Nothing under ${tabLabel.toLowerCase()}${filtered ? " with these filters" : ""}.` : "No bookings yet."}</p>
            <p className="help">{all.length ? "Try another tab, or clear the filters." : "When you book a session, class, workshop or programme, it shows here."}</p>
            {all.length ? null : (
              <Link className="btn2" href="/explore">
                Explore learning experiences
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
