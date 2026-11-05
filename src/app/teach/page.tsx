import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarDays, Check, Clock, Layers, UserRound, Wallet } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { ListingPill } from "@/components/app/listing-pill";
import { getSessionUser } from "@/lib/auth";
import { getMyOffers, getMyTeacher, getWindows } from "@/lib/data/listings";
import { getTeachingBookings } from "@/lib/data/bookings";
import { getSessionsFor } from "@/lib/data/lessons";
import { BookingPill } from "@/components/app/booking-pill";
import { formatTime, formatWeekday } from "@/domain/format";

export const metadata: Metadata = { title: "Teaching" };

export default function TeachDashboard() {
  return (
    <Guarded next="/teach">
      <Dashboard />
    </Guarded>
  );
}

async function Dashboard() {
  const [user, teacher] = await Promise.all([getSessionUser(), getMyTeacher()]);
  const offers = teacher ? await getMyOffers(teacher.id) : [];
  const [windows, bookings] = await Promise.all([getWindows(offers.map((o) => o.id)), getTeachingBookings()]);
  const active = bookings.filter((b) => ["scheduled", "in_progress", "awaiting_note", "paid"].includes(b.status));
  const sessions = await getSessionsFor(active.map((b) => b.id));
  const soon = active
    .filter((b) => b.status !== "scheduled" || new Date(b.starts_at).getTime() < new Date().getTime() + 7 * 24 * 3600_000)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 6);
  const first = user?.name?.split(" ")[0];

  const steps = [
    {
      href: "/teach/apply",
      label: "Tell us what you have done",
      sub: teacher ? "Profile saved. Edit it any time." : "Profile, categories and an employment declaration.",
      done: !!teacher,
      Icon: UserRound,
    },
    {
      href: "/teach/profile",
      label: "Get your profile approved",
      sub:
        teacher?.listing_status === "approved"
          ? "Approved."
          : teacher?.listing_status === "pending_review"
            ? "In review. We usually decide within two working days."
            : teacher?.listing_status === "rejected"
              ? "Changes needed. See the note on your profile."
              : "Send your profile for review when it is ready.",
      done: teacher?.listing_status === "approved",
      Icon: BadgeCheck,
    },
    {
      href: offers.length ? "/teach/offers" : "/teach/offers/new",
      label: "Create an offer and get it approved",
      sub: offers.some((o) => o.listing_status === "approved")
        ? "At least one offer is live."
        : offers.length
          ? "Send your offer for review."
          : "Scope, price inside the band, session length.",
      done: offers.some((o) => o.listing_status === "approved"),
      Icon: Layers,
    },
    {
      href: "/teach/availability",
      label: "Add the times you can teach",
      sub: windows.length ? `${windows.length} weekly ${windows.length === 1 ? "window" : "windows"} set.` : "Weekly windows learners can book.",
      done: windows.length > 0,
      Icon: Clock,
    },
  ];

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h1 className="t1">
          <span lang="sw">Karibu</span>
          {first ? `, ${first}` : ""}.
        </h1>
        <p className="text-ink-2">
          {teacher ? "Here is what needs doing before learners can book you." : "Start an application to teach. Your learner account stays as it is."}
        </p>
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="start-h">
        <h2 id="start-h" className="t2">
          Get ready to teach
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
        <p className="help">
          Then get checked: your ID and payout number first, so learners can book and you can be paid.{" "}
          <Link href="/teach/verification">Verification</Link>
        </p>
      </section>

      {offers.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="off-h">
          <h2 id="off-h" className="t3">
            Your offers
          </h2>
          <ul className="flex flex-col">
            {offers.slice(0, 5).map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 border-b border-dashed border-line-2 py-2.5">
                <Link href={`/teach/offers/${o.id}`}>{o.title}</Link>
                <ListingPill state={o.listing_status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="flex flex-col gap-3" aria-labelledby="today-h">
          <h2 id="today-h" className="t3">
            This week
          </h2>
          {soon.length ? (
            <ul className="card flex flex-col divide-y divide-dashed divide-line-2 p-0!">
              {soon.map((b) => {
                const s = sessions.find((x) => x.booking_id === b.id);
                return (
                  <li key={b.id}>
                    <Link
                      href={s ? `/teach/sessions/${s.id}` : `/teach/bookings/${b.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-ink no-underline hover:bg-orange-wash"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="font-semibold">{b.learner_alias}</span>
                        <span className="help">
                          <span className="mono">
                            {formatWeekday(b.starts_at)} {formatTime(b.starts_at)}
                          </span>{" "}
                          · {b.title}
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
              <p className="font-semibold">No lessons this week.</p>
              <p className="help">Bookings arrive once an offer is live and learners can pay.</p>
            </div>
          )}
        </section>
        <section className="flex flex-col gap-3" aria-labelledby="earn-h">
          <h2 id="earn-h" className="t3">
            Earnings
          </h2>
          <div className="empty">
            <Wallet size={24} aria-hidden="true" />
            <p className="font-semibold">Earnings appear after your first confirmed lesson.</p>
            <p className="help">
              Payouts go to your M-Pesa weekly, with a statement showing the fee and the <span className="mono">5%</span> withholding tax.
            </p>
            <Link className="btn3" href="/pricing">
              How fees work <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
