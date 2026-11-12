import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarCheck, CalendarDays, CircleAlert, CircleCheck, CircleX, Clock, Download, MapPin, Search, Tag } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { BookingPill } from "@/components/app/booking-pill";
import { StatCard } from "@/components/app/stat-card";
import { getTeachingBookings, type TeachingBooking } from "@/lib/data/bookings";
import { formatDate, formatDuration, formatKES, formatTime, initials } from "@/domain/format";
import { humanMinutes } from "@/domain/matching";
import { KIND_LABELS } from "@/domain/booking";
import { OFFER_MODES } from "@/domain/listing-input";
import { FORMATS } from "@/domain/taxonomy";
import { getMyRuns } from "@/lib/data/runs";
import { RunCard } from "../runs/run-card";

export const metadata: Metadata = { title: "Bookings" };

const RESPONSE_HOURS = 12;

/** Which bookings each tab holds. "Pending" is anything not yet settled, whoever must act next. */
const GROUPS = {
  upcoming: ["accepted", "scheduled", "in_progress"],
  pending: ["paid", "awaiting_note", "awaiting_confirmation", "disputed"],
  completed: ["confirmed", "no_show_learner"],
  cancelled: ["cancelled", "lapsed", "no_show_teacher"],
} as const;
const TABS = [
  ["upcoming", "Upcoming"],
  ["pending", "Pending"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
  ["all", "All bookings"],
] as const;
type Tab = (typeof TABS)[number][0];
const GROUP_FORMATS = [
  ["small_group", "Group classes"],
  ["workshop", "Workshops"],
  ["cohort", "Programmes"],
] as const;
/** Which groups each tab holds. */
const RUN_TABS = { upcoming: ["draft", "open", "confirmed"], pending: ["in_progress"], completed: ["completed"], cancelled: ["cancelled"] } as const;

const inGroup = (b: TeachingBooking, g: keyof typeof GROUPS) => (GROUPS[g] as readonly string[]).includes(b.status);

/** T16: the expert's bookings by status and learning format, as cards. */
export default function TeachBookingsPage(props: PageProps<"/teach/bookings">) {
  return (
    <Guarded next="/teach/bookings">
      <Bookings searchParams={props.searchParams} />
    </Guarded>
  );
}

function Card({ b, now }: { b: TeachingBooking; now: number }) {
  const left = b.status === "paid" && b.paid_at ? Math.round((new Date(b.paid_at).getTime() + RESPONSE_HOURS * 3600_000 - now) / 60_000) : null;
  const who = b.payer_first_name && b.payer_first_name !== b.learner_alias ? `${b.learner_alias} (booked by ${b.payer_first_name})` : b.learner_alias;
  return (
    <li className="card flex flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        <span className="av" aria-hidden="true">
          {initials(b.learner_alias)}
        </span>
        <span className="min-w-0 font-semibold">{who}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <BookingPill status={b.status} />
        {left !== null ? <span className={`pill ${left < 120 ? "bg-error-tint text-error" : "bg-orange-wash text-orange-ink"}`}>Answer within {humanMinutes(Math.max(left, 0))}</span> : null}
      </div>
      <div className="flex flex-col">
        <span className="font-semibold">{b.title}</span>
        <span className="help">
          {FORMATS.one_to_one.label} · {KIND_LABELS[b.kind] ?? b.kind}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5 text-[15px] leading-[22px]">
        <li className="flex items-center gap-2">
          <CalendarDays size={16} aria-hidden="true" className="flex-none text-ink-2" />
          <span className="mono">
            {formatDate(b.starts_at)} · {formatTime(b.starts_at)}
          </span>
        </li>
        <li className="flex items-center gap-2">
          <Tag size={16} aria-hidden="true" className="flex-none text-ink-2" />
          <span>
            <span className="mono">{formatKES(b.price_kes)}</span> · {formatDuration(b.duration_minutes)}
          </span>
        </li>
        <li className="flex items-center gap-2">
          <MapPin size={16} aria-hidden="true" className="flex-none text-ink-2" />
          {OFFER_MODES.find(([c]) => c === b.mode)?.[1] ?? b.mode}
        </li>
      </ul>
      <Link className={`${b.status === "paid" ? "btn" : "btn2"} mt-auto`} href={`/teach/bookings/${b.id}`}>
        {b.status === "paid" ? "Answer this booking" : "View booking"}
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </li>
  );
}

async function Bookings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  // A seat in a group is listed with its group, not as a lesson of its own.
  const all = (await getTeachingBookings()).filter((b) => b.kind !== "seat");
  const now = new Date().getTime();
  const format = GROUP_FORMATS.some(([f]) => f === sp.format) ? (sp.format as (typeof GROUP_FORMATS)[number][0]) : "one_to_one";
  const { runs } = format === "one_to_one" ? { runs: [] } : await getMyRuns();
  const tab: Tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as Tab) : "upcoming";
  const only = typeof sp.experience === "string" ? sp.experience : null;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const onlyTitle = only ? (all.find((b) => b.offering_id === only)?.title ?? "this learning experience") : null;

  const scoped = all.filter((b) => (!only || b.offering_id === only) && (!q || `${b.learner_alias} ${b.payer_first_name ?? ""} ${b.title}`.toLowerCase().includes(q)));
  const shown = scoped
    .filter((b) => tab === "all" || inGroup(b, tab))
    .sort((a, b) => (tab === "upcoming" || tab === "pending" ? a.starts_at.localeCompare(b.starts_at) : b.starts_at.localeCompare(a.starts_at)));
  const toAct = all.filter((b) => b.status === "paid" || b.status === "awaiting_note").length;
  const href = (t: Tab, f: string = format) => {
    const p = new URLSearchParams({ ...(t !== "upcoming" ? { tab: t } : {}), ...(f !== "one_to_one" ? { format: f } : {}), ...(only ? { experience: only } : {}), ...(q ? { q } : {}) });
    return `/teach/bookings${p.size ? `?${p}` : ""}`;
  };
  const groups = runs
    .filter((r) => r.format === format && (!only || r.offering_id === only) && (!q || r.title.toLowerCase().includes(q) || r.seats.some((s) => s.learner_alias.toLowerCase().includes(q))))
    .filter((r) => tab === "all" || (RUN_TABS[tab] as readonly string[]).includes(r.status))
    .sort((a, b) => (tab === "upcoming" || tab === "pending" ? a.starts_at.localeCompare(b.starts_at) : b.starts_at.localeCompare(a.starts_at)));
  const tabLabel = TABS.find(([k]) => k === tab)![1];

  return (
    <div className="flex max-w-[1180px] flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="t1">Bookings</h1>
          <p className="text-ink-2">Your learners and lessons. A paid booking waits {RESPONSE_HOURS} hours for your answer; after that the learner gets the money back as credit.</p>
        </div>
        <a className="btn2" href="/teach/bookings/export" download>
          <Download size={18} aria-hidden="true" />
          Export bookings
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={CalendarCheck} value={all.filter((b) => inGroup(b, "upcoming")).length} label="Upcoming bookings" sub="Confirmed lessons to come" href={href("upcoming")} />
        <StatCard icon={CircleAlert} tone={toAct ? "red" : "sand"} value={toAct} label="Awaiting action" sub="To answer, or a note to write" href={href("pending")} />
        <StatCard icon={CircleCheck} tone="forest" value={all.filter((b) => inGroup(b, "completed")).length} label="Completed" sub="Delivered lessons" href={href("completed")} />
        <StatCard icon={CircleX} tone="sand" value={all.filter((b) => inGroup(b, "cancelled")).length} label="Cancelled" sub="Cancelled or not answered" href={href("cancelled")} />
      </div>

      {onlyTitle ? (
        <p className="panel info items-center">
          <span>Showing bookings for {onlyTitle}.</span>
          <Link className="btn3" href="/teach/bookings">
            Show all
          </Link>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
          {TABS.map(([k, label]) => (
            <Link key={k} className={`chip sm${tab === k ? " on" : ""}`} href={href(k)} aria-current={tab === k ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <form className="relative w-full max-w-[320px]" role="search">
          {tab !== "upcoming" ? <input type="hidden" name="tab" value={tab} /> : null}
          {only ? <input type="hidden" name="experience" value={only} /> : null}
          <label className="sr-only" htmlFor="q">
            Search by learner or learning experience
          </label>
          <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-2" />
          <input id="q" name="q" className="input pl-10!" defaultValue={q} placeholder="Search by learner or learning experience" />
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[15px]">
        <span className="font-semibold">Learning format:</span>
        <Link className={`chip sm${format === "one_to_one" ? " on" : ""}`} href={href(tab, "one_to_one")} aria-current={format === "one_to_one" ? "true" : undefined}>
          {FORMATS.one_to_one.label}
        </Link>
        {GROUP_FORMATS.map(([f, label]) => (
          <Link key={f} className={`chip sm${format === f ? " on" : ""}`} href={href(tab, f)} aria-current={format === f ? "true" : undefined}>
            {label}
          </Link>
        ))}
        {format !== "one_to_one" ? (
          <Link className="btn3" href="/teach/runs">
            Add dates
          </Link>
        ) : null}
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="list-h">
        <h2 id="list-h" className="t3">
          {tabLabel} <span className="mono font-normal text-ink-2">({format === "one_to_one" ? shown.length : groups.length})</span>
        </h2>
        {format !== "one_to_one" ? (
          groups.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {groups.map((r) => (
                <RunCard key={r.id} r={r} />
              ))}
            </ul>
          ) : (
            <div className="empty">
              <CalendarDays size={24} aria-hidden="true" />
              <p className="font-semibold">No {GROUP_FORMATS.find(([f]) => f === format)![1].toLowerCase()} under {tabLabel.toLowerCase()}.</p>
              <p className="help">Each one appears here with its participants once you add its dates.</p>
              <Link className="btn2" href="/teach/runs">
                Group dates
              </Link>
            </div>
          )
        ) : shown.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((b) => (
              <Card key={b.id} b={b} now={now} />
            ))}
          </ul>
        ) : (
          <div className="empty">
            {tab === "upcoming" ? <CalendarDays size={24} aria-hidden="true" /> : <Clock size={24} aria-hidden="true" />}
            <p className="font-semibold">{all.length ? `Nothing under ${tabLabel.toLowerCase()}${q ? " for that search" : ""}.` : "No bookings yet."}</p>
            <p className="help">{all.length ? "Try another tab." : "Bookings appear here once a learner pays."}</p>
          </div>
        )}
      </section>
    </div>
  );
}
