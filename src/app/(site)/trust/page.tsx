import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/site/sections";
import { EscrowPanel, Seal } from "@/components/ui/trust";

export const metadata: Metadata = { title: "Trust and safety" };

const BADGES: [string, string][] = [
  ["ID checked", "National ID matched against the government register (IPRS), and a test payout proves the M-Pesa number belongs to the same person."],
  ["Certificates checked", "Certificates seen and confirmed with the issuer where possible."],
  ["TSC checked", "Registration with the Teachers Service Commission confirmed."],
  ["Experience checked", "Work history checked and two references called."],
  ["Police clearance", "A Certificate of Good Conduct, required before any in-person lesson with a child."],
  ["Top rated", "Consistently high ratings from learners who completed paid lessons."],
];

export default function TrustPage() {
  return (
    <>
      <PageIntro
        title={
          <>
            Trust you can <span className="swash">check.</span>
          </>
        }
        lead="Every badge says what we checked and the date we checked it. If a check has not passed, there is no badge."
      />
      <div className="page-wrap grid gap-10 pb-24 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-10">
          <section className="flex flex-col gap-4" aria-labelledby="b-h">
            <h2 id="b-h" className="mk md">
              What each <span className="hl">badge</span> means
            </h2>
            <ul className="checks">
              {BADGES.map(([b, d]) => (
                <li key={b}>
                  <Seal />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-semibold">{b}</span>
                    <span>{d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="prose-k" aria-labelledby="kids-h">
            <h2 id="kids-h">Children</h2>
            <ul>
              <li>Only a parent or guardian can book for a child, and they give consent before we store anything about the child.</li>
              <li>In-person lessons for a child need the guardian&rsquo;s ID check and the teacher&rsquo;s police clearance.</li>
              <li>The parent receives a note after every lesson.</li>
              <li>We never show a child&rsquo;s face in our marketing without written consent.</li>
            </ul>
            <h2>Your number stays private</h2>
            <p>
              Phone numbers never appear on a card or profile. Messages and calls go through
              masked numbers until the first paid booking.
            </p>
            <h2>Your data</h2>
            <p>
              We follow the Data Protection Act 2019 and will be registered with the Office of the Data Protection Commissioner
              before we take payments. ID documents are stored privately and every view by our staff is logged. Read the{" "}
              <Link href="/privacy">privacy notice</Link>.
            </p>
            <h2>Report a problem</h2>
            <p>
              From the lesson page, use Report a problem within 48 hours. A person reviews every report. For anything urgent about
              a child&rsquo;s safety, contact us immediately at the address in the <Link href="/help">help centre</Link>.
            </p>
          </section>
        </div>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start" aria-label="Money">
          <EscrowPanel />
          <div className="panel items-center">
            <Seal />
            <p>Not the right fit? We match a replacement at no extra cost.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
