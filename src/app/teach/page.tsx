import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, BadgeCheck, CalendarDays, Clock, Layers, UserRound, Wallet } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Teaching" };

const STEPS = [
  { href: "/teach/apply", label: "Tell us what you have done", sub: "Profile, categories and an employment declaration.", Icon: UserRound },
  { href: "/teach/verification", label: "Pass your checks", sub: "ID, payout number, then the checks for your category.", Icon: BadgeCheck },
  { href: "/teach/offers/new", label: "Draft your first offer", sub: "Scope, format and a price inside the band. We review it in two working days.", Icon: Layers },
  { href: "/teach/availability", label: "Add the times you can teach", sub: "Weekly windows learners can book.", Icon: Clock },
];

export default function TeachDashboard() {
  return (
    <Guarded next="/teach">
      <div className="flex flex-col gap-10">
        <Suspense fallback={<div className="skeleton h-12 w-80" />}>
          <Heading />
        </Suspense>

        <section className="flex flex-col gap-4" aria-labelledby="start-h">
          <h2 id="start-h" className="t2">
            Get ready to teach
          </h2>
          <ol className="grid gap-3 md:grid-cols-2">
            {STEPS.map((s, i) => (
              <li key={s.href}>
                <Link className="card flex h-full items-start gap-4 p-5 text-ink no-underline hover:bg-orange-wash" href={s.href}>
                  <span className="stepn flex-none">{i + 1}</span>
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

        <div className="grid gap-6 md:grid-cols-2">
          <section className="flex flex-col gap-3" aria-labelledby="today-h">
            <h2 id="today-h" className="t3">
              Today
            </h2>
            <div className="empty">
              <CalendarDays size={24} aria-hidden="true" />
              <p className="font-semibold">No bookings yet.</p>
              <p className="help">Complete your checks and get an offer approved to be matched with learners.</p>
            </div>
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
    </Guarded>
  );
}

async function Heading() {
  const user = await getSessionUser();
  const first = user?.name?.split(" ")[0];
  const teacher = user?.roles.includes("teacher");
  return (
    <div className="flex flex-col gap-2">
      <h1 className="t1">
        <span lang="sw">Karibu</span>
        {first ? `, ${first}` : ""}.
      </h1>
      <p className="text-ink-2">
        {teacher
          ? "Here is what needs doing before learners can book you."
          : "You are signed in as a learner. Start an application to teach; your learner account stays as it is."}
      </p>
    </div>
  );
}
