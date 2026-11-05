import type { Metadata } from "next";
import Link from "next/link";
import { HowItWorks, PageIntro, PromisesBand, RequestCard } from "@/components/site/sections";
import { Tick } from "@/components/ui/doodles";

export const metadata: Metadata = { title: "How it works" };

const LEARNER = [
  "Browse without an account, or tell us what you need and a person sends three matches within 24 hours.",
  "Book a trial, a single session, a package or a seat. The cancellation terms are shown before you pay.",
  "Pay by M-Pesa or card. The money is held, not paid out.",
  "Meet online or in person. Your teacher or expert checks in and writes a short note after the lesson.",
  "Confirm it happened with one tap. Only then is the teacher paid. If you do nothing for 48 hours, it confirms itself.",
];

export default function HowItWorksPage() {
  return (
    <>
      <PageIntro
        title={
          <>
            Simple for you. <span className="swash">Fair</span> for them.
          </>
        }
        lead="You pay into escrow. The teacher or expert is paid when the lesson happens. Every check they passed is on their profile, with the date."
      />
      <div className="page-wrap pb-20">
        <HowItWorks id="steps" heading={false} />
      </div>
      <PromisesBand />
      <section className="page-wrap flex flex-wrap gap-x-14 gap-y-10 py-20" aria-labelledby="detail-h">
        <div className="flex min-w-0 flex-[1_1_460px] flex-col gap-5">
          <h2 id="detail-h" className="mk md">
            Step by <span className="hl">step</span>
          </h2>
          <ol className="flex flex-col gap-4">
            {LEARNER.map((s, i) => (
              <li key={s} className="flex items-start gap-3.5">
                <span className="stepn flex-none">{i + 1}</span>
                <span className="pt-1.5">{s}</span>
              </li>
            ))}
          </ol>
          <h2 className="mk md mt-6">
            If something <span className="hl t2">goes wrong</span>
          </h2>
          <ul className="flex flex-col gap-3">
            {[
              "The teacher cancels or does not come: you get every shilling back.",
              "It happened but not as agreed: report a problem within 48 hours and a person reviews it.",
              "It is not the right fit: we match a replacement at no extra cost.",
            ].map((s) => (
              <li key={s} className="flex items-start gap-3">
                <Tick style={{ marginTop: 3 }} />
                {s}
              </li>
            ))}
          </ul>
          <p className="text-ink-2">
            Full rules on the <Link href="/pricing">pricing page</Link> and in <Link href="/trust">trust and safety</Link>.
          </p>
        </div>
        <RequestCard className="self-start" />
      </section>
    </>
  );
}
