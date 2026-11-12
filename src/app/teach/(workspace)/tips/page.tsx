import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock, Layers, MessagesSquare, NotebookPen, ShieldCheck, Star, UserRound } from "lucide-react";

export const metadata: Metadata = { title: "Tips" };

/** T31: practical ways to reach more learners. Each one follows from how Koobi works, not from guesswork. */
const TIPS = [
  {
    Icon: UserRound,
    title: "Say what you have done, plainly",
    body: "The line under your name sits on every card. Name the work, the place and the years: learners choose people who have done the thing they want to learn.",
    href: "/teach/profile",
    cta: "Edit your profile",
  },
  {
    Icon: ShieldCheck,
    title: "Finish your checks",
    body: "Learners can only book you once your ID and payout number are checked. Each passed check shows on your profile with its date.",
    href: "/teach/verification",
    cta: "Open verification",
  },
  {
    Icon: Layers,
    title: "Name the result, not the subject",
    body: "“Excel for bookkeepers” is easier to choose than “Excel”. Add three to five things the learner will work on, and say who it is for.",
    href: "/teach/offers",
    cta: "Your learning experiences",
  },
  {
    Icon: CalendarDays,
    title: "Keep your weekly hours true",
    body: "Learners only see times you have opened. Block days you cannot teach, and add extra hours when you have them, so no booking has to be declined.",
    href: "/teach/availability",
    cta: "Availability & Schedule",
  },
  {
    Icon: Clock,
    title: "Answer paid bookings quickly",
    body: "A paid booking waits 12 hours for your answer, then the learner is credited and the booking is gone. Your response time shows on your Business page.",
    href: "/teach/bookings?tab=pending",
    cta: "Pending bookings",
  },
  {
    Icon: MessagesSquare,
    title: "Reply inside Koobi",
    body: "A quick, clear answer to a first message is often what turns an enquiry into a booking. Phone numbers are shared after the first paid booking.",
    href: "/teach/messages",
    cta: "Messages",
  },
  {
    Icon: NotebookPen,
    title: "Write the lesson note the same day",
    body: "You are paid when the learner confirms the lesson, or 48 hours after your note. The sooner the note is in, the sooner the money is released.",
    href: "/teach/bookings",
    cta: "Bookings",
  },
  {
    Icon: Star,
    title: "Offer a trial and a package",
    body: "A half-price first lesson costs you nothing: Koobi covers the difference. A package lets a learner commit to several sessions at once.",
    href: "/teach/offers",
    cta: "Change pricing",
  },
] as const;

export default function TipsPage() {
  return (
    <div className="flex max-w-[980px] flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="t1">Grow your impact</h1>
        <p className="text-ink-2">Eight practical ways to reach more learners. Each one follows from how Koobi works.</p>
      </div>
      <ol className="grid gap-4 md:grid-cols-2">
        {TIPS.map((t, i) => (
          <li key={t.title} className="card flex flex-col gap-3 p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-fmt-1 text-orange-deep" aria-hidden="true">
                <t.Icon size={20} />
              </span>
              <h2 className="t3 flex-1 pt-2">
                <span className="mono text-ink-2">{i + 1}.</span> {t.title}
              </h2>
            </div>
            <p className="text-[16px] leading-6 text-ink-2">{t.body}</p>
            <Link className="btn3 mt-auto self-start" href={t.href}>
              {t.cta} <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
