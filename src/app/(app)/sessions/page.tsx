import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock, Hourglass, List } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { buildActivities, getLearnerBookings, getOpenReschedules, type Activity } from "@/lib/data/learning";
import { FORMAT_PLURALS, LEARNER_MODES } from "@/domain/learning";
import { formatDate, formatDuration, formatTime, initials } from "@/domain/format";
import { dayKey, shiftDay, weekOf } from "@/domain/schedule";
import { isFormatCode } from "@/domain/taxonomy";
import { BookingActions, DoneBanner, FormatTag, MessageLink, StatusPill } from "../bookings/booking-bits";

export const metadata: Metadata = { title: "My Schedule" };

const fmt = (key: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...o, timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`));
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T12:00:00Z`).getTime());

/** My Schedule: when every learning activity takes place, a week at a time or as a list. */
export default function SchedulePage(props: PageProps<"/sessions">) {
  return (
    <Guarded next="/sessions">
      <Schedule searchParams={props.searchParams} />
    </Guarded>
  );
}

const ATTENDANCE = { present: "Present", late: "Late", absent: "Absent" } as const;

function Item({ a, now, moves }: { a: Activity; now: number; moves: Awaited<ReturnType<typeof getOpenReschedules>> }) {
  const b = a.booking;
  const past = new Date(a.ends).getTime() < now;
  return (
    <li className="card grid gap-4 p-4 sm:p-5 lg:grid-cols-[190px_minmax(0,1fr)_minmax(0,1fr)_230px] lg:items-start lg:gap-5">
      <div className="flex items-start gap-3">
        <span className="av" aria-hidden="true">
          {initials(b.teacher_name)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold">{b.teacher_name}</span>
          <span className="text-[14px] leading-5 text-ink-2">Expert</span>
          <MessageLink b={b} back="/sessions" label="Message expert" className="btn3 min-h-[32px]! justify-start! text-[14px]!" />
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Link href={`/learning/${b.offering_id}`} className="font-semibold text-ink no-underline hover:underline">
          {b.title}
        </Link>
        <span className="flex flex-wrap gap-1.5">
          <FormatTag format={b.format} />
          {a.part ? (
            <span className="pill h-[26px]! bg-sand px-2.5! text-[13px]!">
              Session <span className="mono">{a.part.n}</span> of <span className="mono">{a.part.of}</span>
            </span>
          ) : null}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5 text-[15px] leading-[22px]">
        <li>
          {a.cancelled ? (
            <span className="pill bg-sand text-ink-2">Session cancelled</span>
          ) : a.attendance ? (
            <span className={`pill ${a.attendance === "absent" ? "bg-error-tint text-error" : "bg-forest-tint text-forest-ink"}`}>{ATTENDANCE[a.attendance]}</span>
          ) : (
            <StatusPill b={b} />
          )}
        </li>
        <li className="flex items-center gap-2">
          <CalendarDays size={16} aria-hidden="true" className="flex-none text-ink-2" />
          <span className="mono">{formatDate(a.at)}</span>
        </li>
        <li className="flex items-center gap-2">
          <Clock size={16} aria-hidden="true" className="flex-none text-ink-2" />
          <span>
            <span className="mono">
              {formatTime(a.at)} – {formatTime(a.ends)}
            </span>{" "}
            · {LEARNER_MODES[b.mode] ?? b.mode}
          </span>
        </li>
        <li className="flex items-center gap-2">
          <Hourglass size={16} aria-hidden="true" className="flex-none text-ink-2" />
          {formatDuration(b.duration_minutes)}
        </li>
      </ul>
      {past || a.cancelled ? (
        <Link className="btn3 self-start lg:justify-self-end" href={`/bookings/${b.id}`}>
          View booking <ArrowRight size={16} aria-hidden="true" />
        </Link>
      ) : (
        <BookingActions b={b} at={a.at} ends={a.ends} now={now} back="/sessions" moves={moves} />
      )}
    </li>
  );
}

async function Schedule({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, bookings, moves] = await Promise.all([searchParams, getLearnerBookings(), getOpenReschedules()]);
  const now = new Date();
  const today = dayKey(now);
  const view = sp.view === "list" ? "list" : "calendar";
  const day = isDay(sp.day) ? sp.day : today;
  const format = typeof sp.format === "string" && isFormatCode(sp.format) ? sp.format : null;
  const range = sp.range === "past" ? "past" : "upcoming";
  const week = weekOf(day);

  const all = buildActivities(bookings);
  const scoped = all.filter((a) => !format || a.booking.format === format);
  const onDay = (k: string) => scoped.filter((a) => dayKey(a.at) === k);
  const dayItems = onDay(day);
  const listItems = range === "upcoming" ? scoped.filter((a) => new Date(a.ends).getTime() >= now.getTime()) : scoped.filter((a) => new Date(a.ends).getTime() < now.getTime()).reverse();
  const listDays = [...new Set(listItems.map((a) => dayKey(a.at)))];

  const href = (o: { view?: string; day?: string; format?: string | null; range?: string }) => {
    const v = o.view ?? view;
    const d = o.day ?? day;
    const f = o.format === undefined ? format : o.format;
    const r = o.range ?? range;
    const p = new URLSearchParams({ ...(v === "list" ? { view: "list" } : {}), ...(v !== "list" && d !== today ? { day: d } : {}), ...(f ? { format: f } : {}), ...(v === "list" && r === "past" ? { range: "past" } : {}) });
    return `/sessions${p.size ? `?${p}` : ""}`;
  };
  const sameMonth = week[0].slice(0, 7) === week[6].slice(0, 7);
  const weekTitle = `${fmt(week[0], sameMonth ? { day: "numeric" } : { day: "numeric", month: "long" })} – ${fmt(week[6], { day: "numeric", month: "long", year: "numeric" })}`;

  return (
    <div className="flex max-w-[1180px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="t1">My Schedule</h1>
          <p className="text-ink-2">Keep track of your lessons, classes and upcoming activities. Times are East Africa Time.</p>
        </div>
        <nav className="flex gap-2" aria-label="View">
          <Link className={`chip sm${view === "calendar" ? " on" : ""}`} href={href({ view: "calendar" })} aria-current={view === "calendar" ? "page" : undefined}>
            <CalendarDays size={16} aria-hidden="true" />
            Calendar view
          </Link>
          <Link className={`chip sm${view === "list" ? " on" : ""}`} href={href({ view: "list" })} aria-current={view === "list" ? "page" : undefined}>
            <List size={16} aria-hidden="true" />
            List view
          </Link>
        </nav>
      </div>
      <DoneBanner code={sp.done} />

      {view === "calendar" ? (
        <section className="card flex flex-col gap-0 overflow-hidden p-0!" aria-label="Week">
          <div className="flex items-center justify-between gap-2 px-3 py-3 sm:px-4">
            <Link className="btn3 text-ink!" href={href({ day: shiftDay(day, -7) })}>
              <ChevronLeft size={18} aria-hidden="true" />
              <span className="hidden sm:inline">Previous week</span>
              <span className="sr-only sm:hidden">Previous week</span>
            </Link>
            <h2 className="t3 text-center">{weekTitle}</h2>
            <Link className="btn3 text-ink!" href={href({ day: shiftDay(day, 7) })}>
              <span className="hidden sm:inline">Next week</span>
              <span className="sr-only sm:hidden">Next week</span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <ol className="grid grid-cols-7 border-t-[1.5px] border-ink">
            {week.map((k, i) => {
              const n = onDay(k).length;
              const on = k === day;
              return (
                <li key={k} className={i ? "border-l border-dashed border-line-2" : ""}>
                  <Link
                    href={href({ day: k })}
                    aria-current={on ? "date" : undefined}
                    aria-label={`${fmt(k, { weekday: "long", day: "numeric", month: "long" })}, ${n} ${n === 1 ? "activity" : "activities"}`}
                    className={`flex flex-col items-center gap-1 px-1 py-3 text-ink no-underline ${on ? "bg-orange-wash" : "hover:bg-sand"}`}
                  >
                    <span className="text-[13px] leading-4 font-semibold text-ink-2">{fmt(k, { weekday: "short" })}</span>
                    <span className={`mono flex h-9 w-9 items-center justify-center rounded-full text-[17px] ${on ? "bg-ink text-white" : k === today ? "shadow-[inset_0_0_0_1.5px_var(--ink)]" : ""}`}>{Number(k.slice(8))}</span>
                    <span className={`h-1.5 w-1.5 rounded-full ${n ? "bg-orange" : "bg-transparent"}`} aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap items-center gap-2" aria-label="Filter by learning format">
          <Link className={`chip sm${!format ? " on" : ""}`} href={href({ format: null })} aria-current={!format ? "true" : undefined}>
            All
          </Link>
          {FORMAT_PLURALS.map(([f, label]) => (
            <Link key={f} className={`chip sm${format === f ? " on" : ""}`} href={href({ format: f })} aria-current={format === f ? "true" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        {view === "list" ? (
          <nav className="flex gap-2" aria-label="Upcoming or past">
            <Link className={`chip sm${range === "upcoming" ? " on" : ""}`} href={href({ range: "upcoming" })} aria-current={range === "upcoming" ? "true" : undefined}>
              Upcoming
            </Link>
            <Link className={`chip sm${range === "past" ? " on" : ""}`} href={href({ range: "past" })} aria-current={range === "past" ? "true" : undefined}>
              Past
            </Link>
          </nav>
        ) : day !== today ? (
          <Link className="btn3" href={href({ day: today })}>
            Back to today
          </Link>
        ) : null}
      </div>

      {view === "calendar" ? (
        <section className="flex flex-col gap-3" aria-labelledby="day-h">
          <h2 id="day-h" className="t3">
            {fmt(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}{" "}
            <span className="font-sans font-normal text-ink-2">
              (<span className="mono">{dayItems.length}</span> {dayItems.length === 1 ? "activity" : "activities"})
            </span>
          </h2>
          {dayItems.length ? (
            <ul className="flex flex-col gap-3">
              {dayItems.map((a) => (
                <Item key={a.key} a={a} now={now.getTime()} moves={moves} />
              ))}
            </ul>
          ) : (
            <div className="empty">
              <CalendarDays size={24} aria-hidden="true" />
              <p className="font-semibold">No activities scheduled for this day.</p>
              <p className="help">Check other dates, or find something new to learn.</p>
              <Link className="btn3" href="/explore">
                Explore learning <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          )}
        </section>
      ) : listDays.length ? (
        listDays.map((k) => (
          <section key={k} className="flex flex-col gap-3" aria-label={fmt(k, { weekday: "long", day: "numeric", month: "long" })}>
            <h2 className="t3">{fmt(k, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2>
            <ul className="flex flex-col gap-3">
              {listItems
                .filter((a) => dayKey(a.at) === k)
                .map((a) => (
                  <Item key={a.key} a={a} now={now.getTime()} moves={moves} />
                ))}
            </ul>
          </section>
        ))
      ) : (
        <div className="empty">
          <CalendarDays size={24} aria-hidden="true" />
          <p className="font-semibold">{range === "upcoming" ? "Nothing coming up." : "Nothing in the past yet."}</p>
          <p className="help">{all.length ? "Try another filter." : "Your lessons, classes, workshops and programmes show here once you book."}</p>
          <Link className="btn3" href="/explore">
            Explore learning <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
