import type { Metadata } from "next";
import Link from "next/link";
import { Ban, CalendarCheck, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Clock, Pencil, SlidersHorizontal, X } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { StatCard } from "@/components/app/stat-card";
import { getBookingPrefs, getMyOffers, getMyTeacher, getScheduleRows } from "@/lib/data/listings";
import { getTeachingBookings } from "@/lib/data/bookings";
import { CALENDAR_VIEWS, DAY_NAMES, WEEK_ORDER, dayKey, label12, monthGrid, rangesOn, shiftDay, shiftMonth, unionRanges, weekOf, weeklyMinutes, type Blocked, type CalendarView, type Range } from "@/domain/schedule";
import { formatDate, formatTime } from "@/domain/format";
import { removeExtraHours, unblockDate } from "../actions";
import { BlockDateForm, ExtraHoursForm, PrefsForm } from "./schedule-forms";

export const metadata: Metadata = { title: "Availability & Schedule" };

const DONE: Record<string, string> = {
  saved: "Weekly hours saved. Lessons already booked are unchanged.",
  blocked: "Blocked. Learners cannot book that time.",
  unblocked: "Block removed.",
  extra: "Extra hours added. Learners can book them now.",
  extra_removed: "Extra hours removed.",
  prefs: "Booking rules saved. They apply to the times learners are offered from now on.",
};

/** T13: weekly hours, the month's lessons, blocked dates and booking rules in one place. */
export default function AvailabilityPage(props: PageProps<"/teach/availability">) {
  return (
    <Guarded next="/teach/availability">
      <Availability searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Availability({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, teacher] = await Promise.all([searchParams, getMyTeacher()]);
  const offers = teacher ? (await getMyOffers(teacher.id)).filter((o) => o.format === "one_to_one" && o.listing_status !== "retired") : [];
  if (!teacher || !offers.length) {
    return (
      <div className="flex max-w-[620px] flex-col gap-6">
        <h1 className="t1">Availability & Schedule</h1>
        <div className="empty">
          <CalendarDays size={24} aria-hidden="true" />
          <p className="t3">{teacher ? "Create a one-to-one learning experience first." : "Apply first, then add the times you can teach."}</p>
          <p className="help">Your weekly hours are saved with your learning experiences.</p>
          <Link className="btn2" href={teacher ? "/teach/offers/new" : "/teach/apply"}>
            {teacher ? "Create learning experience" : "Apply to teach"}
          </Link>
        </div>
      </div>
    );
  }

  const [rows, bookings, prefs] = await Promise.all([getScheduleRows(offers.map((o) => o.id)), getTeachingBookings(), getBookingPrefs()]);
  const weekly = unionRanges(rows.filter((r) => r.kind === "weekly") as unknown as Range[]);
  const today = dayKey(new Date());
  const blockedAll = new Map<string, Blocked>();
  for (const r of rows) if (r.kind === "blocked" && r.exception_date) blockedAll.set(`${r.exception_date}|${r.starts ?? ""}`, { date: r.exception_date, starts: r.starts, ends: r.ends });
  const blocked = [...blockedAll.values()].sort((a, b) => a.date.localeCompare(b.date) || (a.starts ?? "").localeCompare(b.starts ?? ""));
  const blockedAhead = blocked.filter((b) => b.date >= today);
  const extraAll = new Map<string, Blocked>();
  for (const r of rows) if (r.kind === "extra" && r.exception_date && r.starts) extraAll.set(`${r.exception_date}|${r.starts}`, { date: r.exception_date, starts: r.starts, ends: r.ends });
  const extra = [...extraAll.values()].sort((a, b) => a.date.localeCompare(b.date) || (a.starts ?? "").localeCompare(b.starts ?? ""));
  const extraAhead = extra.filter((e) => e.date >= today);

  const live = bookings.filter((b) => b.kind !== "seat" && !["cancelled", "lapsed", "no_show_teacher"].includes(b.status));
  const upcoming = live.filter((b) => ["paid", "accepted", "scheduled", "in_progress"].includes(b.status) && dayKey(b.starts_at) >= today);
  const hours = Math.round((weeklyMinutes(weekly) / 60) * 10) / 10;

  const view: CalendarView = CALENDAR_VIEWS.some(([v]) => v === sp.view) ? (sp.view as CalendarView) : "month";
  const dayParam = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : null;
  const month = typeof sp.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : (dayParam ?? today).slice(0, 7);
  const picked = dayParam ?? (month === today.slice(0, 7) ? today : `${month}-01`);
  const week = weekOf(picked);
  const href = (v: CalendarView, day: string) => `/teach/availability?${v === "month" ? "" : `view=${v}&`}month=${day.slice(0, 7)}&day=${day}`;
  const dayTitle = (d: string) => `${DAY_NAMES[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${formatDate(d)}`;
  const grid = monthGrid(month);
  const monthTitle = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T00:00:00Z`));
  const byDay = new Map<string, typeof live>();
  for (const b of live) {
    const k = dayKey(b.starts_at);
    byDay.set(k, [...(byDay.get(k) ?? []), b]);
  }
  const pickedBookings = (byDay.get(picked) ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const pickedRanges = rangesOn(picked, weekly, blocked, extra);
  const pickedBlocks = blocked.filter((b) => b.date === picked);
  const done = typeof sp.done === "string" ? DONE[sp.done] : undefined;

  return (
    <div className="flex max-w-[1180px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="t1">Availability & Schedule</h1>
        <p className="text-ink-2">Your working hours, the times learners can book, and the lessons already in your calendar.</p>
      </div>
      {done ? (
        <p className="panel escrow" role="status">
          {done}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <StatCard icon={Clock} tone="forest" value={`${hours}h`} label="Available each week" sub={weekly.length ? "From your weekly hours" : "No weekly hours set yet"} />
        <StatCard icon={CalendarCheck} value={upcoming.length} label="Upcoming bookings" href="/teach/bookings" />
        <StatCard icon={Ban} tone="sand" value={blockedAhead.length} label="Blocked dates" sub="Today onwards" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <section className="card flex flex-col gap-4 p-5" aria-labelledby="week-h">
          <div className="flex flex-col gap-1">
            <h2 id="week-h" className="t3">
              Weekly availability
            </h2>
            <p className="help">These hours repeat every week. Nairobi time.</p>
          </div>
          <ul className="flex flex-col divide-y divide-dashed divide-line-2">
            {WEEK_ORDER.map((d) => {
              const day = weekly.filter((r) => r.weekday === d);
              return (
                <li key={d} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <span className="w-[104px] flex-none font-semibold">{DAY_NAMES[d]}</span>
                  <span className={`mono min-w-0 flex-1 text-[14px] ${day.length ? "" : "text-ink-2"}`}>{day.length ? day.map((r) => `${label12(r.starts)} – ${label12(r.ends)}`).join(", ") : "—"}</span>
                  <span className={`pill ${day.length ? "bg-forest-tint text-forest-ink" : "bg-sand text-ink-2"}`}>{day.length ? "Available" : "Day off"}</span>
                </li>
              );
            })}
          </ul>
          <Link className="btn self-start" href="/teach/availability/weekly">
            <Pencil size={18} aria-hidden="true" />
            Edit weekly availability
          </Link>
        </section>

        <section className="card flex flex-col gap-4 p-5" aria-labelledby="cal-h">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="cal-h" className="t3">
              My calendar
            </h2>
            <nav className="flex gap-1.5" aria-label="Calendar view">
              {CALENDAR_VIEWS.map(([v, label]) => (
                <Link key={v} className={`chip sm${view === v ? " on" : ""}`} href={href(v, picked)} aria-current={view === v ? "page" : undefined} scroll={false}>
                  {label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center justify-center gap-1">
            <Link
              className="iconbtn ghost"
              scroll={false}
              href={view === "month" ? `/teach/availability?month=${shiftMonth(month, -1)}` : href(view, shiftDay(picked, view === "week" ? -7 : -1))}
              aria-label={view === "month" ? "Previous month" : view === "week" ? "Previous week" : "Previous day"}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </Link>
            <span className="min-w-[190px] text-center font-semibold">
              {view === "month" ? monthTitle : view === "week" ? `${formatDate(week[0]).replace(/ \d{4}$/, "")} – ${formatDate(week[6])}` : dayTitle(picked)}
            </span>
            <Link
              className="iconbtn ghost"
              scroll={false}
              href={view === "month" ? `/teach/availability?month=${shiftMonth(month, 1)}` : href(view, shiftDay(picked, view === "week" ? 7 : 1))}
              aria-label={view === "month" ? "Next month" : view === "week" ? "Next week" : "Next day"}
            >
              <ChevronRight size={20} aria-hidden="true" />
            </Link>
          </div>

          {view === "week" ? (
            <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
              {week.map((date) => {
                const lessons = (byDay.get(date) ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
                const whole = blocked.some((b) => b.date === date && !b.starts);
                const open = date >= today ? rangesOn(date, weekly, blocked, extra) : [];
                return (
                  <li key={date} className={`flex min-h-[132px] flex-col gap-1.5 rounded-[12px] border border-dashed border-line-2 p-2 ${date === today ? "bg-orange-wash" : ""}`}>
                    <Link href={href("day", date)} scroll={false} className="flex items-baseline justify-between gap-1 text-ink no-underline hover:underline">
                      <span className="text-[13px] font-semibold">{DAY_NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()].slice(0, 3)}</span>
                      <span className={`mono inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[13px] ${date === today ? "bg-ink text-white" : ""}`}>{Number(date.slice(8))}</span>
                    </Link>
                    {lessons.map((b) => (
                      <Link key={b.id} href={`/teach/bookings/${b.id}`} className="flex flex-col rounded-[8px] bg-fmt-1 px-1.5 py-1 text-[12.5px] leading-4 text-orange-deep no-underline hover:underline">
                        <span className="mono">{formatTime(b.starts_at)}</span>
                        <span className="truncate">{b.learner_alias}</span>
                      </Link>
                    ))}
                    {whole ? (
                      <span className="rounded-[8px] bg-sand px-1.5 py-1 text-[12.5px] leading-4 text-ink-2">Blocked</span>
                    ) : (
                      open.map((r) => (
                        <span key={r.starts} className="mono rounded-[8px] bg-forest-wash px-1.5 py-1 text-[11.5px] leading-4 text-forest-ink">
                          {r.starts}–{r.ends}
                        </span>
                      ))
                    )}
                    {!lessons.length && !whole && !open.length ? <span className="text-[12.5px] text-ink-2">{date < today ? "—" : "Day off"}</span> : null}
                  </li>
                );
              })}
            </ol>
          ) : null}

          <table className={`w-full table-fixed border-collapse text-[14px] ${view === "month" ? "" : "hidden"}`}>
            <thead>
              <tr>
                {WEEK_ORDER.map((d) => (
                  <th key={d} scope="col" className="pb-2 text-[13px] font-semibold text-ink-2">
                    <abbr title={DAY_NAMES[d]} className="no-underline">
                      {DAY_NAMES[d].slice(0, 3)}
                    </abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((week, i) => (
                <tr key={i}>
                  {week.map((date, j) => {
                    if (!date) return <td key={j} className="h-[68px] border border-dashed border-line-2" />;
                    const lessons = byDay.get(date) ?? [];
                    const whole = blocked.some((b) => b.date === date && !b.starts);
                    const open = rangesOn(date, weekly, blocked, extra).length > 0 && date >= today;
                    return (
                      <td key={j} className={`h-[68px] border border-dashed border-line-2 p-0 align-top ${date === picked ? "bg-orange-wash" : ""}`}>
                        <Link
                          href={`/teach/availability?month=${month}&day=${date}`}
                          className="flex h-full flex-col gap-0.5 p-1 text-ink no-underline hover:bg-orange-wash"
                          aria-label={`${formatDate(date)}: ${lessons.length} booked${whole ? ", blocked" : open ? ", available" : ""}`}
                          aria-current={date === picked ? "date" : undefined}
                        >
                          <span className={`mono inline-flex h-6 w-6 items-center justify-center self-start rounded-full text-[13px] ${date === today ? "bg-ink text-white" : ""}`}>{Number(date.slice(8))}</span>
                          {lessons.slice(0, 1).map((b) => (
                            <span key={b.id} className="mono truncate rounded-[6px] bg-fmt-1 px-1 text-[11.5px] leading-[18px] text-orange-deep">
                              {formatTime(b.starts_at)}
                              {lessons.length > 1 ? ` +${lessons.length - 1}` : ""}
                            </span>
                          ))}
                          {whole ? <span className="truncate rounded-[6px] bg-sand px-1 text-[11.5px] leading-[18px] text-ink-2">Blocked</span> : open && !lessons.length ? <span className="ml-1 h-1.5 w-1.5 rounded-full bg-forest" aria-hidden="true" /> : null}
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[13.5px] text-ink-2" aria-label="Calendar legend">
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-forest" aria-hidden="true" /> Available
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-orange" aria-hidden="true" /> Booked
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-line-2" aria-hidden="true" /> Blocked or day off
            </li>
          </ul>

          <div className="flex flex-col gap-2 rounded-[14px] bg-sand p-4">
            <h3 className="font-semibold">
              {formatDate(picked)} · {DAY_NAMES[new Date(`${picked}T12:00:00Z`).getUTCDay()]}
            </h3>
            {pickedBookings.map((b) => (
              <Link key={b.id} href={`/teach/bookings/${b.id}`} className="flex flex-wrap items-center justify-between gap-2 text-ink no-underline hover:underline">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 flex-none rounded-full bg-orange" aria-hidden="true" />
                  <span className="mono">{formatTime(b.starts_at)}</span>
                  <span>
                    {b.title} · {b.learner_alias}
                  </span>
                </span>
                <span className="pill bg-fmt-1 text-orange-deep">Booked</span>
              </Link>
            ))}
            {pickedBlocks.map((b) => (
              <p key={`${b.date}${b.starts}`} className="flex items-center gap-2 text-ink-2">
                <span className="h-2 w-2 flex-none rounded-full bg-line-2" aria-hidden="true" />
                {b.starts ? (
                  <span>
                    Blocked <span className="mono">{label12(b.starts)} – {label12(b.ends!)}</span>
                  </span>
                ) : (
                  "Blocked all day"
                )}
              </p>
            ))}
            {pickedRanges.length ? (
              pickedRanges.map((r) => (
                <p key={r.starts} className="flex items-center gap-2">
                  <span className="h-2 w-2 flex-none rounded-full bg-forest" aria-hidden="true" />
                  <span>
                    Open for booking <span className="mono">{label12(r.starts)} – {label12(r.ends)}</span>
                  </span>
                </p>
              ))
            ) : !pickedBlocks.length ? (
              <p className="help">Day off: no weekly hours on this day.</p>
            ) : null}
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card flex flex-col gap-4 p-5" aria-labelledby="block-h">
          <div className="flex flex-col gap-1">
            <h2 id="block-h" className="t3 flex items-center gap-2">
              <Ban size={18} aria-hidden="true" className="text-orange-deep" />
              Block dates and exceptions
            </h2>
            <p className="help">Take a day off or close some hours. A blocked date always wins over your weekly hours; lessons already booked stay.</p>
          </div>
          <BlockDateForm today={today} />
          {blockedAhead.length ? (
            <ul className="flex flex-col divide-y divide-dashed divide-line-2">
              {blockedAhead.map((b) => (
                <li key={`${b.date}${b.starts}`} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="mono">{formatDate(b.date)}</span> · {b.starts ? <span className="mono">{label12(b.starts)} – {label12(b.ends!)}</span> : "all day"}
                  </span>
                  <form action={unblockDate}>
                    <input type="hidden" name="date" value={b.date} />
                    <input type="hidden" name="starts" value={b.starts ?? ""} />
                    <button type="submit" className="iconbtn ghost" aria-label={`Remove the block on ${formatDate(b.date)}`}>
                      <X size={18} aria-hidden="true" />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="help">No dates blocked.</p>
          )}

          <div className="flex flex-col gap-3 border-t border-dashed border-line-2 pt-4">
            <div className="flex flex-col gap-1">
              <h3 className="flex items-center gap-2 font-semibold">
                <CalendarPlus size={18} aria-hidden="true" className="text-forest" />
                Extra hours on a date
              </h3>
              <p className="help">Open a day or some hours you do not usually work. A block on the same date still wins.</p>
            </div>
            <ExtraHoursForm today={today} />
            {extraAhead.length ? (
              <ul className="flex flex-col divide-y divide-dashed divide-line-2">
                {extraAhead.map((e) => (
                  <li key={`${e.date}${e.starts}`} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      <span className="mono">{formatDate(e.date)}</span> · <span className="mono">{label12(e.starts!)} – {label12(e.ends!)}</span>
                    </span>
                    <form action={removeExtraHours}>
                      <input type="hidden" name="date" value={e.date} />
                      <input type="hidden" name="starts" value={e.starts ?? ""} />
                      <button type="submit" className="iconbtn ghost" aria-label={`Remove the extra hours on ${formatDate(e.date)}`}>
                        <X size={18} aria-hidden="true" />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>

        <section className="card flex flex-col gap-3 p-5" aria-labelledby="pref-h">
          <h2 id="pref-h" className="t3 flex items-center gap-2">
            <SlidersHorizontal size={18} aria-hidden="true" className="text-orange-deep" />
            Booking rules
          </h2>
          <p className="help">
            Times are in Africa/Nairobi (EAT). Slots are as long as each learning experience’s session. A time already booked with you, on any learning experience, is never offered twice.
          </p>
          <PrefsForm prefs={prefs} />
          {!prefs.saved ? <p className="help">These are Koobi’s starting rules. Saving your own needs the latest database update.</p> : null}
        </section>
      </div>
    </div>
  );
}
