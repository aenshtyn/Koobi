import Link from "next/link";
import { CalendarCheck, Search, Sprout, Video } from "lucide-react";
import { brand } from "@/config/brand";
import { Seal, EscrowPanel } from "@/components/ui/trust";
import { Spark, StepArrow } from "@/components/ui/doodles";

export function PromisesBand() {
  return (
    <section className="promises" aria-label="Our promises">
      <div className="page-wrap">
        <ul className="flex flex-wrap gap-x-10 gap-y-4 py-[30px]">
          {brand.promises.map((p) => (
            <li key={p} className="pr min-w-0 flex-[1_1_300px]">
              <Seal />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const STEPS = [
  { n: 1, title: "Explore", body: "Find a lesson, class, workshop or programme, or tell us what you need.", Icon: Search, r: "16px 20px 14px 22px" },
  { n: 2, title: "Book", body: "Choose a time and pay into escrow by M-Pesa or card.", Icon: CalendarCheck, r: "20px 14px 22px 16px" },
  { n: 3, title: "Learn", body: "Join live, online or in person, with a verified teacher or expert.", Icon: Video, r: "14px 22px 18px 20px" },
  { n: 4, title: "Grow", body: "Confirm it happened. We pay the expert, and you get notes and next steps.", Icon: Sprout, r: "22px 16px 20px 14px" },
];

export function HowItWorks({ id = "how", heading = true }: { id?: string; heading?: boolean }) {
  return (
    <section id={id} className="flex flex-col gap-9" aria-labelledby={heading ? `${id}-h` : undefined} aria-label={heading ? undefined : "How it works"}>
      {heading ? (
        <div className="flex items-center gap-3">
          <h2 id={`${id}-h`} className="mk">
            How it <span className="hl">works</span>
          </h2>
          <Spark style={{ transform: "rotate(160deg)" }} />
        </div>
      ) : null}
      <ol className="how">
        {STEPS.map((s, i) => (
          <li key={s.n}>
            <span className="tile" style={{ borderRadius: s.r }}>
              <s.Icon size={26} strokeWidth={1.75} aria-hidden="true" />
            </span>
            {i < STEPS.length - 1 ? <StepArrow /> : null}
            <div className="flex items-center gap-2.5">
              <span className="stepn">{s.n}</span>
              <h3 className="sn">{s.title}</h3>
            </div>
            <p className="text-[15px] leading-[22px] text-ink-2">{s.body}</p>
          </li>
        ))}
      </ol>
      <EscrowPanel who="The expert" />
    </section>
  );
}

export function ExpertBand() {
  return (
    <div id="expert" className="xband flex min-w-0 flex-[1_1_320px] flex-col gap-3">
      <Spark className="spark ink dood" style={{ top: 16, right: 18, transform: "rotate(80deg)" }} />
      <h2 className="mk md max-w-[300px]">Share what you have done. Teach on {brand.name}.</h2>
      <p className="max-w-[340px] text-[15px] leading-[22px]">
        Verification takes a few days. You are paid weekly to M-Pesa, with a statement.
      </p>
      <Link className="opill ink lg mt-auto self-start" href="/become-an-expert">
        Become an expert
      </Link>
    </div>
  );
}

export function RequestCard({ className = "" }: { className?: string }) {
  return (
    <div className={`card r2 flex min-w-0 flex-[1_1_300px] flex-col gap-3.5 p-7 ${className}`}>
      <h2 className="mk md">
        Not sure <span className="hl t2">what to pick?</span>
      </h2>
      <p className="text-ink-2">
        Tell us what you need, when and your budget. A person reads every request and sends you three teachers or experts
        within 24 hours, here or on WhatsApp.
      </p>
      <Link className="opill lg mt-auto self-start" href="/request">
        Request a match
      </Link>
    </div>
  );
}

export function PageIntro({ title, lead, children }: { title: React.ReactNode; lead?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="page-wrap flex flex-col gap-4 pt-6 pb-12">
      <h1 className="dpage max-w-[820px]">{title}</h1>
      {lead ? <p className="lead max-w-[680px]">{lead}</p> : null}
      {children}
    </section>
  );
}
