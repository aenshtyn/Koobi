import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { PageIntro } from "@/components/site/sections";

export const metadata: Metadata = { title: "Help centre" };

const FAQ: { group: string; items: [string, React.ReactNode][] }[] = [
  {
    group: "Booking and paying",
    items: [
      ["Do I need an account to look around?", "No. You only create an account, with your email and a password, when you book, message, follow or teach. You can also request a match without one."],
      ["How do I pay?", "By M-Pesa: we send a prompt to your phone and you enter your PIN. Learners abroad can pay by card. We never see your PIN."],
      ["When is the teacher paid?", "After the lesson, when you confirm it happened. If you do nothing for 48 hours it confirms itself."],
      ["Can I cancel?", <>Yes. Cancel or move a lesson <span className="mono">24</span> hours or more before and you get a full refund. Inside 24 hours there is no automatic refund.</>],
    ],
  },
  {
    group: "Teachers and experts",
    items: [
      ["How are they checked?", <>Every badge says what we checked and when. See <Link href="/trust">trust and safety</Link>.</>],
      ["What if it is not a good fit?", "Tell us and we match a replacement at no extra cost."],
      ["Can I call the teacher directly?", "Numbers stay masked until your first paid booking, then you can message and call through the booking."],
    ],
  },
  {
    group: "Teaching",
    items: [
      ["How long do the checks take?", "Most finish within a few working days. Learning experiences are reviewed within two working days."],
      ["When do I get paid?", "Weekly, to the M-Pesa number you verified, with a statement."],
      ["Why is tax deducted?", "Kenyan law requires digital marketplaces to withhold 5% on payments to sellers. We pay it to KRA for you and show it on your statement."],
    ],
  },
];

export default function HelpPage() {
  return (
    <>
      <PageIntro title="How can we help?" lead={<>Answers to the common questions. Anything else: <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.</>} />
      <div className="page-wrap flex max-w-[860px] flex-col gap-10 pb-24">
        {FAQ.map((g) => (
          <section key={g.group} className="flex flex-col gap-3" aria-label={g.group}>
            <h2 className="mk sm">
              <span className="hl">{g.group}</span>
            </h2>
            <div className="card flex flex-col p-0">
              {g.items.map(([q, a], i) => (
                <details key={q} className={`group px-5 py-4 ${i ? "border-t border-dashed border-line-2" : ""}`}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                    {q}
                    <span aria-hidden="true" className="mono text-ink-2 group-open:rotate-45 transition-transform">+</span>
                  </summary>
                  <div className="pt-2 text-ink-2">{a}</div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
