import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, CircleHelp, Clock, FileText, Globe, History, Layers, MapPin, MessagesSquare, Package, UserRound } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { ProgressRing } from "@/components/app/progress-ring";
import { getExperiences, getOpenReschedules, type LearnerBooking } from "@/lib/data/learning";
import { getOfferPage } from "@/lib/data/catalogue";
import { BOOKING_LABELS, BOOKING_TONE, KIND_LABELS } from "@/domain/booking";
import { EXPERIENCE_LABELS, EXPERIENCE_TONE, LEARNER_MODES, percent } from "@/domain/learning";
import { formatDate, formatDayMonth, formatDuration, formatTime, initials } from "@/domain/format";
import { FORMATS } from "@/domain/taxonomy";
import { BookingActions, DoneBanner, FormatTag, MessageLink } from "../../bookings/booking-bits";

export const metadata: Metadata = { title: "Learning experience" };

/** One learning experience as the learner has it: the expert, the next session, progress and history. */
export default function ExperiencePage(props: PageProps<"/learning/[id]">) {
  return (
    <Guarded next="/learning">
      <Details params={props.params} searchParams={props.searchParams} />
    </Guarded>
  );
}

const ATTENDANCE = { present: "Attended", late: "Attended, late", absent: "Absent" } as const;

async function Details({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp, { experiences }, moves] = await Promise.all([params, searchParams, getExperiences(), getOpenReschedules()]);
  const e = experiences.find((x) => x.offering_id === id);
  if (!e) notFound();
  const page = await getOfferPage(e.slug);
  const now = new Date();
  const first = e.teacher_name.split(" ")[0];
  const back = `/learning/${e.offering_id}`;
  const latest: LearnerBooking = e.next?.booking ?? [...e.bookings].sort((a, b) => b.when.localeCompare(a.when))[0];
  const unit = e.format === "one_to_one" ? "lesson" : "session";
  const seat = e.bookings.find((b) => b.seat && b.seat.run_status !== "cancelled" && b.group !== "cancelled") ?? e.bookings.find((b) => b.seat);
  const lessons = e.bookings.filter((b) => !b.seat).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const learnerIds = [...new Map(e.bookings.map((b) => [b.learner_id, b.learner_alias])).entries()];
  const modes = [...new Set(e.bookings.map((b) => b.mode))];

  return (
    <div className="flex max-w-[920px] flex-col gap-6">
      <Link className="btn3 self-start" href="/learning">
        <ArrowLeft size={16} aria-hidden="true" />
        Back to My Learning
      </Link>
      <DoneBanner code={sp.done} />
      <div className="flex flex-col gap-3">
        <h1 className="t1">{e.title}</h1>
        <div className="flex flex-wrap gap-2">
          <FormatTag format={e.format} />
          <span className={`pill h-[26px]! px-2.5! text-[13px]! ${EXPERIENCE_TONE[e.state]}`}>{EXPERIENCE_LABELS[e.state]}</span>
        </div>
      </div>

      <section className="card flex flex-wrap items-center gap-4 p-5" aria-label="Your expert">
        <span className="av lg" aria-hidden="true">
          {initials(e.teacher_name)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="t3">{e.teacher_name}</span>
          {e.teacher_headline ? <span className="text-[15px] text-ink-2">{e.teacher_headline}</span> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {e.teacher_slug ? (
            <Link className="btn2 ink" href={`/teachers/${e.teacher_slug}`}>
              <UserRound size={18} aria-hidden="true" />
              View profile
            </Link>
          ) : null}
          <MessageLink b={latest} back={back} className="btn2" label="Message expert" />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="card flex flex-col gap-4 p-5" aria-labelledby="over-h">
          <h2 id="over-h" className="t3 flex items-center gap-2">
            <BookOpen size={20} aria-hidden="true" />
            Learning overview
          </h2>
          {page?.offer.summary ? <p className="text-[16px] leading-6">{page.offer.summary}</p> : null}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[15px] leading-[22px]">
            <div className="flex flex-col">
              <dt className="flex items-center gap-1.5 text-ink-2">
                <Clock size={15} aria-hidden="true" />
                Session length
              </dt>
              <dd>{formatDuration(latest.duration_minutes)}</dd>
            </div>
            <div className="flex flex-col">
              <dt className="flex items-center gap-1.5 text-ink-2">
                <MapPin size={15} aria-hidden="true" />
                Where
              </dt>
              <dd>{modes.map((m) => LEARNER_MODES[m] ?? m).join(", ")}</dd>
            </div>
            {page?.details?.languages.length ? (
              <div className="flex flex-col">
                <dt className="flex items-center gap-1.5 text-ink-2">
                  <Globe size={15} aria-hidden="true" />
                  Language
                </dt>
                <dd>{page.details.languages.join(", ")}</dd>
              </div>
            ) : null}
            {e.started ? (
              <div className="flex flex-col">
                <dt className="flex items-center gap-1.5 text-ink-2">
                  <CalendarDays size={15} aria-hidden="true" />
                  {new Date(e.started).getTime() > now.getTime() ? "Starts" : "Started"}
                </dt>
                <dd className="mono">{formatDate(e.started)}</dd>
              </div>
            ) : null}
          </dl>
          {page ? (
            <Link className="btn3 self-start" href={`/offers/${e.slug}`}>
              See the full description <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ) : (
            <p className="help">This learning experience is not open for new bookings right now. Your bookings are not affected.</p>
          )}
        </section>

        <section className="card flex flex-col gap-4 p-5" aria-labelledby="prog-h">
          <h2 id="prog-h" className="t3 flex items-center gap-2">
            <Layers size={20} aria-hidden="true" />
            Your progress
          </h2>
          {e.total ? (
            <div className="flex items-center gap-4">
              <ProgressRing pct={percent(e.done, e.total)}>
                <span className="mono text-[20px]">
                  {e.done}/{e.total}
                </span>
                <span className="text-[12px] text-ink-2">{unit}s done</span>
              </ProgressRing>
              <span className="flex flex-col">
                <span className="mono text-[26px] leading-8">{Math.max(0, e.total - e.done)}</span>
                <span className="text-[15px] text-ink-2">remaining</span>
              </span>
            </div>
          ) : (
            <div className="flex flex-col">
              <span className="mono text-[30px] leading-9">{e.done}</span>
              <span className="text-[15px] text-ink-2">
                {unit}
                {e.done === 1 ? "" : "s"} done
              </span>
              <span className="help mt-2">Single lessons have no set total. A package or a programme shows how many are left.</span>
            </div>
          )}
        </section>
      </div>

      <section className="card flex flex-col gap-4 p-5" aria-labelledby="next-h">
        <h2 id="next-h" className="t3 flex items-center gap-2">
          <CalendarDays size={20} aria-hidden="true" />
          {e.next ? "Next session" : "No session booked"}
        </h2>
        {e.next ? (
          <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)_230px] sm:items-start">
            <span className="flex w-[72px] flex-none flex-col items-center rounded-[12px] bg-fmt-1 px-2 py-2 text-center">
              <span className="text-[13px] leading-4 font-semibold">{new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Africa/Nairobi" }).format(new Date(e.next.at))}</span>
              <span className="mono text-[15px] leading-5">{formatDayMonth(e.next.at)}</span>
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-semibold">
                {KIND_LABELS[e.next.booking.kind] && e.next.booking.kind !== "seat" ? KIND_LABELS[e.next.booking.kind] : FORMATS[e.format].label} with {e.teacher_name}
              </span>
              <span className="text-[15px] text-ink-2">
                <span className="mono">
                  {formatTime(e.next.at)} – {formatTime(e.next.ends)}
                </span>{" "}
                East Africa Time · {LEARNER_MODES[e.next.booking.mode] ?? e.next.booking.mode}
              </span>
              <span className={`pill mt-1 self-start ${BOOKING_TONE[e.next.booking.status] ?? "bg-sand"}`}>{BOOKING_LABELS[e.next.booking.status] ?? e.next.booking.status}</span>
            </div>
            <BookingActions b={e.next.booking} at={e.next.at} ends={e.next.ends} now={now.getTime()} back={back} moves={moves} />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-ink-2">{e.state === "completed" ? "You have finished everything you booked here." : "Choose a time for your next session."}</p>
            {page ? (
              <Link className="btn2" href={`/book/${e.slug}`}>
                Book {e.done ? "again" : "a session"}
              </Link>
            ) : null}
          </div>
        )}
      </section>

      <section className="card flex flex-col gap-3 p-5" aria-labelledby="hist-h">
        <h2 id="hist-h" className="t3 flex items-center gap-2">
          <History size={20} aria-hidden="true" />
          Session history
        </h2>
        {seat?.seat ? (
          <ol className="flex flex-col divide-y divide-dashed divide-line-2">
            {seat.seat.sessions.map((s) => {
              const over = new Date(s.ends_at).getTime() <= now.getTime();
              return (
                <li key={s.sequence_no} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-[15px]">
                  <span>
                    Session <span className="mono">{s.sequence_no}</span>
                  </span>
                  <span className="mono">
                    {formatDate(s.starts_at)} · {formatTime(s.starts_at)} – {formatTime(s.ends_at)}
                  </span>
                  <span className={`pill ${s.status === "cancelled" ? "bg-sand text-ink-2" : s.attendance === "absent" ? "bg-error-tint text-error" : over ? "bg-forest-tint text-forest-ink" : "bg-orange-wash text-orange-ink"}`}>
                    {s.status === "cancelled" ? "Cancelled" : s.attendance ? ATTENDANCE[s.attendance] : over ? "Completed" : "Upcoming"}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : null}
        {lessons.length ? (
          <ol className="flex flex-col divide-y divide-dashed divide-line-2">
            {lessons.map((b, i) => (
              <li key={b.id}>
                <Link href={`/bookings/${b.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-[15px] text-ink no-underline hover:bg-orange-wash">
                  <span>
                    Session <span className="mono">{i + 1}</span> · {KIND_LABELS[b.kind] ?? "Lesson"}
                  </span>
                  <span className="mono">
                    {formatDate(b.starts_at)} · {formatTime(b.starts_at)} – {formatTime(b.ends)}
                  </span>
                  <span className={`pill ${BOOKING_TONE[b.status] ?? "bg-sand"}`}>{b.status === "confirmed" ? "Completed" : b.group === "upcoming" ? "Upcoming" : (BOOKING_LABELS[b.status] ?? b.status)}</span>
                </Link>
              </li>
            ))}
          </ol>
        ) : null}
        {seat ? (
          <Link className="btn3 self-start" href={`/bookings/${seat.id}`}>
            View the booking <ArrowRight size={16} aria-hidden="true" />
          </Link>
        ) : null}
      </section>

      {e.packages.length ? (
        <section className="card flex flex-col gap-3 p-5" aria-labelledby="pkg-h">
          <h2 id="pkg-h" className="t3 flex items-center gap-2">
            <Package size={20} aria-hidden="true" />
            Your package
          </h2>
          <ul className="flex flex-col divide-y divide-dashed divide-line-2">
            {e.packages.map((p) => (
              <li key={p.id}>
                <Link href={`/packages/${p.id}`} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[15px] text-ink no-underline hover:bg-orange-wash">
                  <span>
                    <span className="mono">{p.sessions_total}</span> sessions{p.learner?.alias && e.learners.length > 1 ? ` for ${p.learner.alias}` : ""}
                  </span>
                  <span>
                    <span className="mono">{p.sessions_used}</span> used · <span className="mono">{Math.max(0, p.sessions_total - p.sessions_used)}</span> left
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card flex flex-col gap-3 p-5" aria-labelledby="notes-h">
        <h2 id="notes-h" className="t3 flex items-center gap-2">
          <FileText size={20} aria-hidden="true" />
          Lesson notes and files
        </h2>
        <p className="text-[15px] leading-[22px] text-ink-2">
          After each lesson {first} writes a note: what you covered and what to do next. Files {first} sends you are in your conversation.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {learnerIds.map(([lid, alias]) => (
            <Link key={lid} className="btn3" href={`/learners/${lid}/progress`}>
              {learnerIds.length > 1 ? `${alias}’s lesson notes` : "Read lesson notes"} <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <section className="card grid gap-5 p-5 sm:grid-cols-2" aria-labelledby="help-h">
        <div className="flex flex-col gap-2">
          <h2 id="help-h" className="t3 flex items-center gap-2">
            <MessagesSquare size={20} aria-hidden="true" />
            Messages and support
          </h2>
          <p className="text-[15px] leading-[22px] text-ink-2">Have a question about your lessons? Ask {first}.</p>
          <MessageLink b={latest} back={back} className="btn2 self-start" />
        </div>
        <div className="flex flex-col gap-2 sm:border-l sm:border-dashed sm:border-line-2 sm:pl-5">
          <h3 className="label flex items-center gap-2">
            <CircleHelp size={18} aria-hidden="true" />
            Need help?
          </h3>
          <p className="text-[15px] leading-[22px] text-ink-2">The Koobi team helps with payments, cancellations and technical problems.</p>
          <Link className="btn2 ink self-start" href="/help">
            Contact support
          </Link>
        </div>
      </section>
    </div>
  );
}
