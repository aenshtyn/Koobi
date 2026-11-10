import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro, PromisesBand } from "@/components/site/sections";
import { DEFAULT_RATES, splitSession } from "@/domain/commission";
import { formatKES } from "@/domain/format";
import { Seal } from "@/components/ui/trust";

export const metadata: Metadata = { title: "Pricing and promises" };

/* Rates come from the domain defaults so one change updates every page.
   Commission is an open founders' decision (DECISIONS.md, 2026-11-05): 20% sliding vs a flat 15%. */
const pct = (r: number) => `${Math.round(r * 100)}%`;

export default function PricingPage() {
  const example = splitSession({ priceKes: 1500, rate: DEFAULT_RATES.onlineOpening, vatRegistered: false });
  return (
    <>
      <PageIntro
        title={
          <>
            One price. <span className="swash">No surprises.</span>
          </>
        }
        lead="Learners pay the price shown on the learning experience and nothing else. Teachers and experts see the fee and the tax on every statement."
      />
      <div className="page-wrap grid gap-6 pb-20 lg:grid-cols-2">
        <section className="card flex flex-col gap-4 p-7" aria-labelledby="learn-h">
          <h2 id="learn-h" className="mk md">
            If you are <span className="hl">learning</span>
          </h2>
          <ul className="flex flex-col">
            {[
              ["Registration", "Free"],
              ["Booking fee", "None"],
              ["Trial lesson", "Discounted"],
              ["Cancel or move 24 hours or more before", "Full refund"],
              ["Teacher cancels or does not come", "Full refund"],
              ["Not the right fit", "Free replacement"],
            ].map(([k, v]) => (
              <li key={k} className="kv">
                <span>{k}</span>
                <span className="font-sans! font-semibold text-forest">{v}</span>
              </li>
            ))}
          </ul>
          <p className="help">
            Inside <span className="mono">24</span> hours there is no automatic refund. Lessons start with a{" "}
            <span className="mono">15</span>-minute grace period. Missed lessons are refunded only with a documented reason.
          </p>
        </section>
        <section className="card r2 flex flex-col gap-4 p-7" aria-labelledby="teach-h">
          <h2 id="teach-h" className="mk md">
            If you are <span className="hl t2">teaching</span>
          </h2>
          <ul className="flex flex-col">
            <li className="kv">
              <span>Fee on online lessons</span>
              <span>{pct(DEFAULT_RATES.onlineOpening)}</span>
            </li>
            <li className="kv">
              <span>After 50 paid hours with the same learner</span>
              <span>{pct(DEFAULT_RATES.onlineAfter50h)}</span>
            </li>
            <li className="kv">
              <span>After 200 paid hours with the same learner</span>
              <span>{pct(DEFAULT_RATES.onlineAfter200h)}</span>
            </li>
            <li className="kv">
              <span>Trial lessons</span>
              <span className="font-sans! font-semibold text-forest">Paid in full</span>
            </li>
            <li className="kv">
              <span>Payout to M-Pesa</span>
              <span className="font-sans! font-semibold text-forest">Weekly, fee paid by us</span>
            </li>
          </ul>
          <div className="panel flex-col gap-1">
            <p className="font-semibold">One {formatKES(1500)} online session</p>
            <div className="w-full">
              <div className="kv">
                <span>Learner pays</span>
                <span>{formatKES(example.price)}</span>
              </div>
              <div className="kv">
                <span>Fee ({pct(DEFAULT_RATES.onlineOpening)})</span>
                <span>− {formatKES(example.commission)}</span>
              </div>
              <div className="kv">
                <span>Withholding tax ({pct(DEFAULT_RATES.withholding)}, paid to KRA for you)</span>
                <span>− {formatKES(example.withholding)}</span>
              </div>
              <div className="kv total">
                <span>You receive</span>
                <span>{formatKES(example.teacherNet)}</span>
              </div>
            </div>
          </div>
        </section>
        <div className="panel escrow items-center lg:col-span-2">
          <Seal />
          <p>
            <b>Why there is a fee.</b> It pays for holding the money until the lesson happens, the checks behind every badge,
            the replacement promise and a person who answers when something goes wrong. <Link href="/how-it-works">How it works</Link>
          </p>
        </div>
      </div>
      <PromisesBand />
    </>
  );
}
