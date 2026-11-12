import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, AtSign, BadgeCheck, Bell, Clock, Globe, Phone, Settings, ShieldCheck, UserRound } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { getSettings } from "@/lib/data/account";
import { getMyTeacher } from "@/lib/data/listings";
import { getMyTeacherPayout } from "@/lib/data/earnings";
import { initials } from "@/domain/format";
import { LISTING_LABELS } from "@/domain/listing";

export const metadata: Metadata = { title: "Profile & Account" };

/** T30: who you are on Koobi, how your teaching profile stands, and where each thing is changed. */
export default function TeachAccountPage() {
  return (
    <Guarded next="/teach/account">
      <Account />
    </Guarded>
  );
}

async function Account() {
  const [{ profile }, teacher, payout] = await Promise.all([getSettings(), getMyTeacher(), getMyTeacherPayout()]);
  const name = profile?.display_name ?? teacher?.display_name ?? "Your account";
  const links = [
    { href: "/teach/profile", Icon: Globe, label: "Public profile", sub: "What learners read about you" },
    { href: "/teach/verification", Icon: ShieldCheck, label: "Verification", sub: "Your identity, credentials and payout number" },
    { href: "/teach/settings", Icon: Settings, label: "Settings", sub: "KRA PIN and payout number" },
    { href: "/teach/notifications", Icon: Bell, label: "Notifications", sub: "What Koobi has told you" },
  ];
  return (
    <div className="flex max-w-[980px] flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="t1">Profile & Account</h1>
        <p className="text-ink-2">Who you are on Koobi, how your teaching profile stands, and where each thing is changed.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card flex flex-col gap-4 p-5" aria-labelledby="acc-h">
          <h2 id="acc-h" className="t3 flex items-center gap-2">
            <UserRound size={20} aria-hidden="true" />
            Your account
          </h2>
          <div className="flex items-center gap-3">
            <span className="av lg" aria-hidden="true">
              {initials(name)}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="t3">{name}</span>
              <span className="help">One account for learning and teaching</span>
            </span>
          </div>
          <div className="flex flex-col">
            <div className="kv">
              <span className="flex items-center gap-2">
                <AtSign size={16} aria-hidden="true" /> Email
              </span>
              <span className="font-sans! break-all whitespace-normal!">{profile?.email ?? "Not added"}</span>
            </div>
            <div className="kv">
              <span className="flex items-center gap-2">
                <Phone size={16} aria-hidden="true" /> Phone
              </span>
              <span>{profile?.phone_e164 ?? "Not added"}</span>
            </div>
            <div className="kv">
              <span className="flex items-center gap-2">
                <Clock size={16} aria-hidden="true" /> Time zone
              </span>
              <span className="font-sans!">{profile?.time_zone ?? "Africa/Nairobi"}</span>
            </div>
          </div>
          <Link className="btn2 self-start" href="/account/settings">
            Change account details <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <p className="help">Your name, phone, message choices and data requests are in your account settings, shared with your learner side.</p>
        </section>

        <section className="card flex flex-col gap-4 p-5" aria-labelledby="teach-h">
          <h2 id="teach-h" className="t3 flex items-center gap-2">
            <BadgeCheck size={20} aria-hidden="true" />
            Your teaching profile
          </h2>
          {teacher ? (
            <>
              <div className="flex flex-col gap-1">
                <span className="font-semibold">{teacher.display_name}</span>
                {teacher.headline ? <span className="text-ink-2">{teacher.headline}</span> : null}
              </div>
              <div className="flex flex-col">
                <div className="kv">
                  <span>Profile</span>
                  <span className="font-sans!">{LISTING_LABELS[teacher.listing_status] ?? teacher.listing_status}</span>
                </div>
                <div className="kv">
                  <span>Identity</span>
                  <span className="font-sans!">{teacher.status === "bookable" ? "Verified" : "Not verified yet"}</span>
                </div>
                <div className="kv">
                  <span>Payout number</span>
                  <span>{payout.masked ?? "Not added"}</span>
                </div>
                <div className="kv">
                  <span>KRA PIN</span>
                  <span>{payout.kraMasked ?? "Not added"}</span>
                </div>
              </div>
              <Link className="btn2 self-start" href="/teach/profile">
                Edit your profile <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </>
          ) : (
            <>
              <p className="text-ink-2">You have not applied to teach yet. Your learner account stays as it is.</p>
              <Link className="btn self-start" href="/teach/apply">
                Start your application
              </Link>
            </>
          )}
        </section>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="card flex h-full items-center gap-3.5 p-4 text-ink no-underline hover:bg-orange-wash">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-fmt-1 text-orange-deep" aria-hidden="true">
                <l.Icon size={20} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{l.label}</span>
                <span className="help text-[14px]! leading-5!">{l.sub}</span>
              </span>
              <ArrowRight size={18} aria-hidden="true" className="flex-none text-ink-2" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
