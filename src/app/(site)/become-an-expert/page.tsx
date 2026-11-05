import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { PageIntro } from "@/components/site/sections";
import { Bulb, Spark, Tick } from "@/components/ui/doodles";
import { Seal } from "@/components/ui/trust";

export const metadata: Metadata = {
  title: "Become an expert",
  description: "Teach what you have done. Verified profiles, money held until the lesson happens, weekly M-Pesa payouts.",
};

const WHO = [
  "Trained teachers who are not employed full time by TSC",
  "Retired teachers and lecturers",
  "Professionals: engineers, accountants, HR managers, marketers, nurses",
  "Practitioners: farmers, extension officers, tailors, mechanics, designers",
];

const CHECKS = [
  ["Phone", "A code to your phone number."],
  ["ID checked", "Your national ID matched against IPRS, and a small test payout to prove the M-Pesa number is yours."],
  ["Certificates, TSC or experience checked", "What fits your category: certificates and a TSC lookup for school subjects, work history and references for professional skills, evidence of practice for hands-on skills."],
  ["Police clearance", "Only before in-person lessons with children."],
  ["Demo lesson", "A short recorded lesson, scored by a person."],
];

export default function BecomeAnExpertPage() {
  return (
    <>
      <PageIntro
        title={
          <>
            Teach what you have <span className="swash">done.</span>
          </>
        }
        lead={`${brand.name} is for people who have done the work. Learners see what we checked about you, with the date. You are paid weekly to M-Pesa.`}
      >
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <Link className="btn lg" href="/teach/apply">
            Start your application
          </Link>
          <span className="text-sm text-ink-2">Takes about 15 minutes. Checks take a few days.</span>
        </div>
      </PageIntro>

      <div className="page-wrap grid gap-10 pb-16 lg:grid-cols-2">
        <section className="flex flex-col gap-4" aria-labelledby="who-h">
          <div className="flex items-center gap-2">
            <h2 id="who-h" className="mk md">
              Who <span className="hl">teaches here</span>
            </h2>
            <Spark className="spark sm" />
          </div>
          <ul className="card flex flex-col gap-3 p-6">
            {WHO.map((w) => (
              <li key={w} className="flex items-start gap-3">
                <Tick style={{ marginTop: 3 }} />
                {w}
              </li>
            ))}
          </ul>
          <p className="help">
            The TSC Code of Conduct bars teachers in full-time TSC employment from other paid work, so every applicant declares
            their employment. School-subject offers are agreed with the parent and run in term time.
          </p>
        </section>

        <section className="flex flex-col gap-4" aria-labelledby="checks-h">
          <h2 id="checks-h" className="mk md">
            The <span className="hl t2">checks</span>
          </h2>
          <ol className="flex flex-col gap-3">
            {CHECKS.map(([t, d], i) => (
              <li key={t} className="card r3 flex items-start gap-3.5 p-4">
                <span className="stepn flex-none">{i + 1}</span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{t}</span>
                  <span className="text-[15px] leading-[22px] text-ink-2">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="page-wrap pb-24" aria-labelledby="money-h">
        <div className="xband flex flex-col gap-4">
          <Bulb className="bulb dood hide-sm" style={{ right: 28, top: 18 }} />
          <h2 id="money-h" className="mk md">
            How you get paid
          </h2>
          <ul className="flex max-w-[640px] flex-col gap-2">
            <li>Learners pay before the lesson; the money is held until it happens.</li>
            <li>After the lesson you check out and write a short note. The learner confirms, or it confirms itself after 48 hours.</li>
            <li>Every week we send what you earned to your M-Pesa, with a statement showing the fee and the 5% withholding tax.</li>
          </ul>
          <Link className="opill ink lg self-start" href="/pricing">
            See the fees
          </Link>
        </div>
        <div className="panel escrow mt-8 items-center">
          <Seal />
          <p>
            <b>Badges show only what passed, with the date.</b> Draft your profile and offers straight away; they go live after
            a person reviews them, usually within two working days.
          </p>
        </div>
      </section>
    </>
  );
}
