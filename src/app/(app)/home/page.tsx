import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, CircleAlert, Clock, CreditCard, HandHelping, Sparkles, UserRoundCheck } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { ProgressRing } from "@/components/app/progress-ring";
import { RequestPill } from "@/components/app/request-pill";
import { getSessionUser } from "@/lib/auth";
import { getMyRequests } from "@/lib/data/matching";
import { listOffers } from "@/lib/data/catalogue";
import { getExperiences, getLearnerProfile } from "@/lib/data/learning";
import { LEARNER_MODES, percent } from "@/domain/learning";
import { formatDate, formatDayMonth, formatDuration, formatKES, formatTime } from "@/domain/format";
import { FORMATS, categoryByCode, type CategoryCode } from "@/domain/taxonomy";
import { FormatTag, StatusPill } from "../bookings/booking-bits";

export const metadata: Metadata = { title: "Home" };

/** L1: the learner's home. What is coming up, how learning is going, and where to go next. */
export default function LearnerHome(props: PageProps<"/home">) {
  return (
    <Guarded next="/home">
      <Home searchParams={props.searchParams} />
    </Guarded>
  );
}

const QUICK = [
  { href: "/request", label: "Ask for a match", sub: "A person finds you three checked experts", Icon: HandHelping },
  { href: "/sessions", label: "View my schedule", sub: "See your upcoming sessions", Icon: CalendarDays },
  { href: "/following", label: "Following", sub: "Experts you keep up with", Icon: UserRoundCheck },
  { href: "/payments", label: "Manage payments", sub: "View transactions and receipts", Icon: CreditCard },
];

async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [user, sp, { experiences, bookings }, requests, profile] = await Promise.all([getSessionUser(), searchParams, getExperiences(), getMyRequests(), getLearnerProfile()]);
  const first = user?.name?.split(" ")[0];
  const now = new Date().getTime();

  const upcoming = bookings.filter((b) => b.group === "upcoming" && new Date(b.ends).getTime() > now).sort((a, b) => a.when.localeCompare(b.when));
  const toConfirm = bookings.filter((b) => b.status === "awaiting_confirmation");
  const toPay = bookings.filter((b) => b.status === "awaiting_payment" || b.status === "requested");

  // Progress across what has a known total (packages and groups); single lessons only add to the count.
  const counted = experiences.filter((e) => e.total && e.state !== "completed");
  const done = counted.reduce((n, e) => n + e.done, 0);
  const total = counted.reduce((n, e) => n + (e.total ?? 0), 0);
  const lessonsDone = experiences.reduce((n, e) => n + e.done, 0);
  const active = experiences.filter((e) => e.state !== "completed").length;

  // Suggestions come from the categories chosen in My Profile, or else the ones already booked.
  const chosen = (profile?.prefs?.categories ?? []) as CategoryCode[];
  const booked = [...new Set(bookings.map((b) => b.category).filter((c): c is string => !!c))] as CategoryCode[];
  const basis = chosen.length ? chosen : booked;
  const mine = new Set(bookings.map((b) => b.offering_id));
  const pool = (await Promise.all((basis.length ? basis.slice(0, 2) : [undefined]).map((category) => listOffers({ category })))).flat();
  const suggestions = pool.filter((o, i) => !mine.has(o.id) && pool.findIndex((x) => x.id === o.id) === i).slice(0, 3);
  const basisNames = basis.map((c) => categoryByCode(c)?.short).filter(Boolean).join(" and ");

  return (
    <div className="flex max-w-[1080px] flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-3">
          <h1 className="t1">Welcome back{first ? `, ${first}` : ""}</h1>
          <p className="text-ink-2">Continue your learning on Koobi.</p>
        </div>
        <Link className="btn" href="/explore">
          Explore learning <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>

      {sp.request === "sent" ? (
        <div className="panel escrow items-center" role="status">
          <span className="seal" aria-hidden="true" />
          <p>
            <b>Request sent.</b> A person is on it and will reply within 24 hours, here or on WhatsApp.
          </p>
        </div>
      ) : null}

      {toConfirm.length || toPay.length ? (
        <Link
          href={toConfirm.length ? `/bookings/${toConfirm[0].id}/confirm` : "/bookings?tab=pending"}
          className="flex items-center gap-3 rounded-[14px] bg-orange-wash px-4 py-3 font-semibold text-ink no-underline shadow-[inset_0_0_0_1.5px_var(--orange)]"
        >
          <CircleAlert size={20} aria-hidden="true" className="flex-none text-orange" />
          <span className="flex-1">
            {toConfirm.length
              ? `${toConfirm.length} ${toConfirm.length === 1 ? "lesson is" : "lessons are"} waiting for you to confirm.`
              : `${toPay.length} ${toPay.length === 1 ? "booking is" : "bookings are"} waiting for payment.`}
          </span>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      ) : null}

      <ul className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {QUICK.map((q) => (
          <li key={q.href}>
            <Link href={q.href} className="card flex h-full items-start gap-3 p-3.5 text-ink no-underline hover:bg-orange-wash sm:p-4">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-fmt-1 text-orange-deep" aria-hidden="true">
                <q.Icon size={20} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[15px] leading-5 font-semibold">{q.label}</span>
                <span className="text-[13.5px] leading-[18px] text-ink-2">{q.sub}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section className="card flex flex-col gap-4 p-5" aria-labelledby="up-h">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="up-h" className="t3 flex items-center gap-2">
              <CalendarDays size={20} aria-hidden="true" />
              Upcoming bookings
            </h2>
            <Link className="btn3" href="/bookings">
              View all <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          {upcoming.length ? (
            <ul className="flex flex-col divide-y divide-dashed divide-line-2">
              {upcoming.slice(0, 3).map((b) => (
                <li key={b.id}>
                  <Link href={`/bookings/${b.id}`} className="flex flex-wrap items-center gap-4 py-3 text-ink no-underline hover:bg-orange-wash">
                    <span className="flex w-[68px] flex-none flex-col items-center rounded-[12px] bg-fmt-1 px-2 py-1.5 text-center">
                      <span className="text-[13px] leading-4 font-semibold">{new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Africa/Nairobi" }).format(new Date(b.when))}</span>
                      <span className="mono text-[14px] leading-5">{formatDayMonth(b.when)}</span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-semibold">{b.title}</span>
                      <span className="help">
                        {FORMATS[b.format].label} with {b.teacher_name} · <span className="mono">{formatTime(b.when)}</span> · {formatDuration(b.duration_minutes)} · {LEARNER_MODES[b.mode] ?? b.mode}
                      </span>
                    </span>
                    <StatusPill b={b} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">
              <CalendarDays size={24} aria-hidden="true" />
              <p className="font-semibold">No bookings coming up.</p>
              <p className="help">Your first trial is covered by the replacement promise: if it is not the right fit, we match you again.</p>
            </div>
          )}
        </section>

        <section className="card flex flex-col gap-4 p-5" aria-labelledby="prog-h">
          <h2 id="prog-h" className="t3 flex items-center gap-2">
            <BookOpen size={20} aria-hidden="true" />
            Your learning progress
          </h2>
          {total ? (
            <div className="flex items-center gap-4">
              <ProgressRing pct={percent(done, total)}>
                <span className="mono text-[22px]">{percent(done, total)}%</span>
              </ProgressRing>
              <p className="text-[15px] leading-[22px]">
                <span className="mono">{done}</span> of <span className="mono">{total}</span> sessions done in your packages and programmes.
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              <span className="mono text-[30px] leading-9">{lessonsDone}</span>
              <span className="text-[15px] text-ink-2">{lessonsDone === 1 ? "lesson" : "lessons"} done</span>
            </div>
          )}
          <p className="help">
            {active ? (
              <>
                <span className="mono">{active}</span> learning {active === 1 ? "experience" : "experiences"} under way.
              </>
            ) : (
              "Nothing under way yet. Book a session to start."
            )}
          </p>
          <Link className="btn2 mt-auto self-start" href="/learning">
            View My Learning <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
      </div>

      {requests.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="rq-h">
          <h2 id="rq-h" className="t3">
            Your requests for a match
          </h2>
          <ul className="card flex flex-col p-0!">
            {requests.slice(0, 3).map((r, i) => (
              <li key={r.id} className={i ? "border-t border-dashed border-line-2" : ""}>
                <Link className="flex items-center justify-between gap-3 px-4 py-3 text-ink no-underline hover:bg-orange-wash" href={`/requests/${r.id}`}>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">{r.subject}</span>
                    <span className="mono text-xs text-ink-2">{formatDate(r.submitted_at)}</span>
                  </span>
                  <RequestPill status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {suggestions.length ? (
        <section className="flex flex-col gap-4" aria-labelledby="rec-h">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="rec-h" className="t3 flex items-center gap-2">
                <Sparkles size={20} aria-hidden="true" />
                {basis.length ? "Recommended for you" : "Learning experiences to explore"}
              </h2>
              <p className="help">
                {chosen.length
                  ? `From the interests in your profile: ${basisNames}.`
                  : booked.length
                    ? `From what you have booked: ${basisNames}.`
                    : profile?.prefs
                      ? "Choose your interests in My Profile and this list follows them."
                      : "Open for booking on Koobi now."}
              </p>
            </div>
            <Link className="btn3" href="/explore">
              View all <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <ul className="grid gap-3 md:grid-cols-3">
            {suggestions.map((o) => (
              <li key={o.id}>
                <Link href={`/offers/${o.slug}`} className="card flex h-full flex-col gap-2 p-4 text-ink no-underline hover:bg-orange-wash">
                  <span className="flex items-start justify-between gap-2">
                    <FormatTag format={o.format} />
                    <span className="mono text-[15px]">{formatKES(o.price_kes)}</span>
                  </span>
                  <span className="font-semibold">{o.title}</span>
                  <span className="text-[14px] leading-5 text-ink-2">{o.teacher_name}</span>
                  <span className="mt-auto flex items-center gap-1.5 text-[14px] leading-5 text-ink-2">
                    <Clock size={15} aria-hidden="true" />
                    {o.format === "cohort" && o.sessions_in_run ? `${o.sessions_in_run} sessions` : formatDuration(o.duration_minutes)}
                    <span className="text-ink-2">{FORMATS[o.format].unit}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
