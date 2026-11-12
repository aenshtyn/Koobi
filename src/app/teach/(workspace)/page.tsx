import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, BadgeCheck, BookOpen, CalendarCheck, CalendarDays, Check, CircleAlert, Clock, Globe, Inbox, Layers, MessagesSquare, PlusCircle,
  ShieldCheck, UserRound, Video, Wallet,
} from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { BookingPill } from "@/components/app/booking-pill";
import { StatCard } from "@/components/app/stat-card";
import { getSessionUser } from "@/lib/auth";
import { getMyOffers, getMyTeacher, getWindows } from "@/lib/data/listings";
import { getMyRequirements } from "@/lib/data/expert";
import { getTeachingBookings } from "@/lib/data/bookings";
import { getSessionsFor } from "@/lib/data/lessons";
import { getThreads } from "@/lib/data/matching";
import { getEarningsByMonth, monthLabel } from "@/lib/data/earnings";
import { formatKES, formatTime } from "@/domain/format";
import { KIND_LABELS } from "@/domain/booking";
import { OFFER_MODES } from "@/domain/listing-input";
import { dayKey } from "@/domain/schedule";

export const metadata: Metadata = { title: "Dashboard" };

export default function TeachDashboard(props: PageProps<"/teach">) {
  return (
    <Guarded next="/teach">
      <Dashboard searchParams={props.searchParams} />
    </Guarded>
  );
}

/** T10: the expert's overview. The setup checklist shows above it only until setup is done. */
async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [user, teacher, sp] = await Promise.all([getSessionUser(), getMyTeacher(), searchParams]);
  const first = user?.name?.split(" ")[0];
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Africa/Nairobi" }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (!teacher) {
    return (
      <div className="flex max-w-[620px] flex-col gap-6">
        <h1 className="t1">
          {greeting}
          {first ? `, ${first}` : ""}
        </h1>
        <p className="text-ink-2">Start an application to teach on Koobi. Your learner account stays as it is.</p>
        <Link className="btn self-start" href="/teach/apply">
          Start your application
        </Link>
      </div>
    );
  }

  const [offers, req] = await Promise.all([getMyOffers(teacher.id), getMyRequirements()]);
  const [windows, everyBooking, threads, months] = await Promise.all([getWindows(offers.map((o) => o.id)), getTeachingBookings(), getThreads(), getEarningsByMonth(6)]);
  const bookings = everyBooking.filter((b) => b.kind !== "seat"); // a seat is shown with its group

  const published = offers.filter((o) => o.listing_status === "approved");
  const upcoming = bookings
    .filter((b) => ["accepted", "scheduled", "in_progress"].includes(b.status) && new Date(b.starts_at).getTime() > now.getTime() - 3 * 3600_000)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const toAnswer = bookings.filter((b) => b.status === "paid");
  const toNote = bookings.filter((b) => b.status === "awaiting_note");
  const attention = toAnswer.length + toNote.length;
  const unread = threads.reduce((s, t) => s + t.unread, 0);
  const sessions = await getSessionsFor(upcoming.slice(0, 4).map((b) => b.id));
  // The overview's month: this month unless one of the last six is picked.
  const month = months.find((m) => m.month === sp.month) ?? months.at(-1)!;
  const current = month === months.at(-1);
  const monthTitle = (m: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T00:00:00Z`));
  const inMonth = bookings.filter((b) => dayKey(b.starts_at).startsWith(month.month));
  const delivered = inMonth.filter((b) => b.status === "confirmed").length;

  const steps = [
    { href: "/teach/profile", label: "Application approved", sub: "You are a Koobi expert. Nothing is public until your profile is published.", done: true, Icon: UserRound },
    {
      href: "/teach/profile/video",
      label: "Upload your introduction video",
      sub: req.video ? "Approved." : "1 to 3 minutes. Koobi reviews it before it shows on your profile.",
      done: req.video,
      Icon: Video,
    },
    {
      href: offers.length ? "/teach/offers" : "/teach/offers/new",
      label: "Create a learning experience and get it approved",
      sub: published.length ? "At least one is approved." : offers.length ? "Send it for review." : "What you teach, the price, the session length.",
      done: published.length > 0,
      Icon: Layers,
    },
    {
      href: "/teach/availability",
      label: "Add the times you can teach",
      sub: windows.length ? `${windows.length} weekly ${windows.length === 1 ? "window" : "windows"} set.` : "Weekly hours learners can book.",
      done: windows.length > 0,
      Icon: Clock,
    },
    {
      href: "/teach/profile",
      label: "Publish your public profile",
      sub: teacher.listing_status === "approved" ? "Published. Learners can find you." : "Once your profile, video and a learning experience are ready.",
      done: teacher.listing_status === "approved",
      Icon: BadgeCheck,
    },
    {
      href: "/teach/verification/payout-number",
      label: "Add your M-Pesa payout number",
      sub: teacher.status === "bookable" ? "Payout number checked." : "Needed before learners can book you and before your first payout.",
      done: teacher.status === "bookable",
      Icon: ShieldCheck,
    },
  ];
  const settingUp = steps.some((s) => !s.done);

  const quick = [
    { href: "/teach/offers/new", label: "Create a learning experience", Icon: PlusCircle },
    { href: "/teach/availability", label: "Update availability", Icon: CalendarDays },
    { href: "/teach/requests", label: "See learner requests", Icon: Inbox },
    { href: "/teach/profile", label: "View your public profile", Icon: Globe },
  ];

  return (
    <div className="flex max-w-[1080px] flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="t1">
          {greeting}
          {first ? `, ${first}` : ""}
        </h1>
        <p className="text-ink-2">Here is what is happening with your teaching on Koobi.</p>
        <Link
          href="/teach/verification"
          className={`pill self-start no-underline ${teacher.status === "bookable" ? "bg-forest-tint text-forest-ink" : "bg-sand text-ink"}`}
        >
          <ShieldCheck size={16} aria-hidden="true" />
          {teacher.status === "bookable" ? "ID and payout number checked" : "Checks not finished"}
        </Link>
      </div>

      {settingUp ? (
        <section className="flex flex-col gap-4" aria-labelledby="start-h">
          <h2 id="start-h" className="t2">
            Finish setting up
          </h2>
          <ol className="grid gap-3 md:grid-cols-2">
            {steps.map((s, i) => (
              <li key={s.label}>
                <Link className={`card flex h-full items-start gap-4 p-5 text-ink no-underline hover:bg-orange-wash ${s.done ? "bg-forest-wash!" : ""}`} href={s.href}>
                  <span className={`stepn flex-none ${s.done ? "bg-forest! text-white!" : ""}`}>{s.done ? <Check size={18} aria-label="Done" /> : i + 1}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="t3">{s.label}</span>
                    <span className="help">{s.sub}</span>
                  </span>
                  <s.Icon size={22} aria-hidden="true" className="flex-none text-ink-2" />
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="flex flex-col gap-4" aria-labelledby="over-h">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="over-h" className="t2">
            Your overview
          </h2>
          <form className="flex items-center gap-2">
            <label className="sr-only" htmlFor="over-month">
              Month
            </label>
            <span className="sel">
              <select id="over-month" name="month" className="select min-h-[44px]! py-2! pr-9! text-[15px]!" defaultValue={month.month}>
                {[...months].reverse().map((m) => (
                  <option key={m.month} value={m.month}>
                    {monthTitle(m.month)}
                  </option>
                ))}
              </select>
            </span>
            <button className="btn2 ink min-h-[44px]!" type="submit">
              Show
            </button>
          </form>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {current ? (
            <StatCard icon={CalendarCheck} value={upcoming.length} label="Upcoming bookings" href="/teach/bookings" />
          ) : (
            <StatCard icon={CalendarCheck} value={delivered} label={`Lessons in ${monthLabel(month.month, true)}`} sub="Confirmed as delivered" href="/teach/bookings?tab=completed" />
          )}
          <StatCard icon={Wallet} tone="forest" value={formatKES(month.net_kes)} label={`${monthLabel(month.month, true)} earnings`} sub="After the fee and tax" href="/teach/earnings" />
          <StatCard icon={BookOpen} value={published.length} label="Active learning experiences" href="/teach/offers" />
          <StatCard icon={MessagesSquare} tone="forest" value={unread} label="Unread messages" href="/teach/messages" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section className="card flex flex-col gap-4 p-5" aria-labelledby="up-h">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="up-h" className="t3">
              Upcoming sessions
            </h2>
            <Link className="btn3" href="/teach/bookings">
              View all <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          {upcoming.length ? (
            <ul className="flex flex-col divide-y divide-dashed divide-line-2">
              {upcoming.slice(0, 4).map((b) => {
                const s = sessions.find((x) => x.booking_id === b.id);
                const d = new Date(b.starts_at);
                const wd = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Africa/Nairobi" }).format(d);
                const dm = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" }).format(d);
                return (
                  <li key={b.id}>
                    <Link href={s ? `/teach/sessions/${s.id}` : `/teach/bookings/${b.id}`} className="flex flex-wrap items-center gap-4 py-3 text-ink no-underline hover:bg-orange-wash">
                      <span className="flex w-[68px] flex-none flex-col items-center rounded-[12px] bg-fmt-1 px-2 py-1.5 text-center">
                        <span className="text-[13px] leading-4 font-semibold">{wd}</span>
                        <span className="mono text-[14px] leading-5">{dm}</span>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold">{b.title}</span>
                        <span className="help">
                          {KIND_LABELS[b.kind]} with {b.learner_alias} · <span className="mono">{formatTime(b.starts_at)}</span> ·{" "}
                          {OFFER_MODES.find(([c]) => c === b.mode)?.[1] ?? b.mode}
                        </span>
                      </span>
                      <BookingPill status={b.status} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="empty">
              <CalendarDays size={24} aria-hidden="true" />
              <p className="font-semibold">No sessions coming up.</p>
              <p className="help">Bookings appear here once a learner has paid and you have accepted.</p>
            </div>
          )}
          {attention ? (
            <Link
              href={toAnswer.length ? `/teach/bookings/${toAnswer[0].id}` : "/teach/bookings"}
              className="flex items-center gap-3 rounded-[14px] bg-orange-wash px-4 py-3 font-semibold text-ink no-underline shadow-[inset_0_0_0_1.5px_var(--orange)]"
            >
              <CircleAlert size={20} aria-hidden="true" className="flex-none text-orange" />
              <span className="flex-1">
                {toAnswer.length
                  ? `${toAnswer.length} paid ${toAnswer.length === 1 ? "booking is" : "bookings are"} waiting for your answer.`
                  : `${toNote.length} lesson ${toNote.length === 1 ? "note is" : "notes are"} due.`}
              </span>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          ) : null}
        </section>

        <section className="card flex flex-col gap-4 p-5" aria-labelledby="quick-h">
          <h2 id="quick-h" className="t3">
            Quick actions
          </h2>
          <ul className="grid grid-cols-2 gap-3">
            {quick.map((q) => (
              <li key={q.href}>
                <Link
                  href={q.href}
                  className="flex h-full min-h-[104px] flex-col items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-line-2 bg-card px-3 py-4 text-center text-[15px] leading-5 font-semibold text-ink no-underline hover:bg-orange-wash"
                >
                  <q.Icon size={24} aria-hidden="true" className="text-orange" />
                  {q.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
