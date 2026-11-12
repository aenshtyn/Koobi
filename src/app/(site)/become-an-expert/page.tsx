import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Briefcase, Camera, GraduationCap, Laptop, Users, Video, Wrench } from "lucide-react";
import { brand } from "@/config/brand";
import { Bulb, Spark, StepArrow } from "@/components/ui/doodles";
import { Seal } from "@/components/ui/trust";

export const metadata: Metadata = {
  title: "Become an expert",
  description: "Teach what you know. Apply in five steps, set your own prices and get paid to M-Pesa.",
};

/** New people create an account first and land on the application; signed-in people go straight there. */
const APPLY = "/signup?intent=teach&next=%2Fteach%2Fapply";

const WHO = [
  { Icon: GraduationCap, title: "Educators and teachers", body: "Teach languages, school subjects and academic skills.", r: "16px 20px 14px 22px" },
  { Icon: Briefcase, title: "Professionals", body: "Share expertise in engineering, business, finance, HR, marketing and other professional fields.", r: "20px 14px 22px 16px" },
  { Icon: Users, title: "Trainers and coaches", body: "Help learners develop practical skills and achieve professional goals.", r: "14px 22px 18px 20px" },
  { Icon: Wrench, title: "Skilled practitioners", body: "Teach hands-on skills in areas such as design, agriculture, tailoring, mechanics and more.", r: "22px 16px 20px 14px" },
];

const CHECKS = [
  ["Complete your application", "Provide your personal information, professional background, areas of expertise and preferred learning formats."],
  ["Verify your identity", "Submit your identity document and complete the required verification checks."],
  ["Verify your expertise", "We review relevant qualifications, professional certifications and work experience."],
  ["Attend an onboarding meeting", "If shortlisted, we invite you to a short online meeting."],
  ["Receive your decision", "We approve your application, request more information or decline it."],
];

const PAID = [
  ["Deliver your session", "Conduct the lesson or learning activity as booked."],
  ["Confirm completion", "Complete the session checkout process and provide any required session notes."],
  ["Receive your earnings", `Eligible earnings are paid to your registered M-Pesa account according to ${brand.name}’s payout schedule.`],
];

function ApplyButton() {
  return (
    <Link className="btn lg" href={APPLY}>
      Apply to Become an Expert
      <ArrowRight size={20} aria-hidden="true" />
    </Link>
  );
}

export default function BecomeAnExpertPage() {
  return (
    <>
      <section className="page-wrap flex flex-wrap items-center gap-x-12 gap-y-10 pt-6 pb-16" aria-labelledby="bx-h">
        <div className="flex min-w-0 flex-[1_1_460px] flex-col gap-5">
          <h1 id="bx-h" className="d1">
            Teach what you know.
            <br /> Help others <span className="swash">grow.</span>
          </h1>
          <p className="lead max-w-[560px]">
            {brand.name} connects experienced professionals, educators, trainers and skilled practitioners with people who want to learn.{" "}
            <b className="font-semibold text-ink">Share your expertise</b> through live lessons, group classes, workshops and structured
            programmes.
          </p>
          <p className="lead max-w-[560px]">
            Set your prices, manage your availability and build meaningful learning experiences around your expertise.
          </p>
          <div className="mt-1 flex flex-col items-start gap-4">
            <ApplyButton />
            <p className="flex items-start gap-2.5 text-[15px] leading-[22px] text-ink-2">
              <Seal size={20} className="mt-px flex-none" />
              Five application steps. A short onboarding meeting. Every application is reviewed.
            </p>
          </div>
        </div>

        {/* No stock photos: real expert photos come later. Until then, the four kinds of expert as icons. */}
        <div className="relative min-w-0 flex-[1_1_380px]" aria-hidden="true">
          <Spark className="spark dood hide-sm" style={{ right: -6, top: -22, transform: "rotate(30deg)" }} />
          <div className="ph warm drawn grid! h-[380px] grid-cols-2 gap-4 p-7! sm:h-[420px]" style={{ borderRadius: "46% 54% 40% 60% / 52% 44% 56% 48%" }}>
            {WHO.map(({ Icon, title, r }, i) => (
              <span key={title} className={`flex items-center justify-center ${i % 2 ? "justify-self-start" : "justify-self-end"} ${i < 2 ? "self-end" : "self-start"}`}>
                <span className="tile h-[88px]! w-[88px]!" style={{ borderRadius: r, transform: `rotate(${[-4, 3, 2, -3][i]}deg)` }}>
                  <Icon size={38} strokeWidth={1.6} />
                </span>
              </span>
            ))}
          </div>
          <div className="floatcard r2" style={{ left: 0, bottom: 26, transform: "rotate(-1.5deg)" }}>
            <span className="inline-flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[12px_14px_11px_15px] bg-forest-tint">
              <Camera size={22} strokeWidth={1.7} />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">Your photo and video</span>
              <span className="text-xs text-ink-2">Learners see the real you</span>
            </span>
          </div>
        </div>
      </section>

      <section className="page-wrap flex flex-col gap-5 pb-16" aria-labelledby="who-h">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <h2 id="who-h" className="mk">
              Who <span className="hl">teaches</span> here?
            </h2>
            <Spark className="spark sm hide-sm" />
          </div>
          <p className="max-w-[720px] text-[17px] leading-[26px]">
            {brand.name} welcomes people with knowledge, practical skills and professional experience to share.
          </p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WHO.map(({ Icon, title, body, r }, i) => (
            <li key={title} className={`card r${(i % 4) + 1} flex flex-col items-center gap-2.5 px-5 py-6 text-center`}>
              <span className="tile bg-orange-wash!" style={{ borderRadius: r }}>
                <Icon size={26} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <h3 className="h5">{title}</h3>
              <p className="text-[15px] leading-[22px] text-ink-2">{body}</p>
            </li>
          ))}
        </ul>
        <p className="max-w-[820px] text-[16px] leading-[25px]">
          You do not necessarily need a university degree. {brand.name} considers relevant qualifications, professional experience, practical
          expertise and supporting evidence, depending on your area of expertise.
        </p>
      </section>

      <section className="page-wrap flex flex-col gap-5 pb-16" aria-labelledby="checks-h">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <h2 id="checks-h" className="mk">
              The <span className="hl t2">checks</span>
            </h2>
            <Spark className="spark sm hide-sm" style={{ transform: "rotate(40deg)" }} />
          </div>
          <p className="max-w-[760px] text-[17px] leading-[26px]">
            We review every application to help learners understand who they are learning from and what has been verified.
          </p>
        </div>
        <ol className="grid gap-x-7 gap-y-6 pt-4 sm:grid-cols-2 lg:grid-cols-5">
          {CHECKS.map(([title, body], i) => (
            <li key={title} className={`card r${(i % 4) + 1} relative flex flex-col items-center gap-2 px-4 pt-8 pb-5 text-center`}>
              <span className="stepn absolute -top-[18px] left-1/2 -ml-5">{i + 1}</span>
              <h3 className="h5">{title}</h3>
              <p className="text-[14px] leading-[20px] text-ink-2">{body}</p>
              {i < CHECKS.length - 1 ? <StepArrow className="step-arrow hidden! lg:block!" style={{ right: -26, left: "auto", top: 18, width: 22 }} /> : null}
            </li>
          ))}
        </ol>
        <div className="panel items-center bg-orange-wash! text-[15px]! leading-[23px]!">
          <span className="tile h-[44px]! w-[44px]! flex-none">
            <Video size={22} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <p>
            <b>Your introduction video is mandatory</b> before your public profile <b>can be published.</b> Your profile and Learning
            Experiences must also pass their respective approval processes before becoming visible to learners.
          </p>
        </div>
      </section>

      <section className="page-wrap flex flex-wrap items-stretch gap-x-12 gap-y-8 pb-16" aria-labelledby="money-h">
        <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5">
              <h2 id="money-h" className="mk">
                How you <span className="hl">get paid</span>
              </h2>
              <Spark className="spark sm hide-sm" style={{ transform: "rotate(-15deg)" }} />
            </div>
            <p className="max-w-[560px] text-[17px] leading-[26px]">
              Learners pay before their sessions. Payments are held until the scheduled learning session takes place, according to{" "}
              {brand.name}’s payment and refund policies.
            </p>
          </div>
          <ol className="flex flex-col gap-4">
            {PAID.map(([title, body], i) => (
              <li key={title} className="flex items-start gap-3.5">
                <span className="stepn">{i + 1}</span>
                <p className="pt-1.5 text-[16px] leading-[24px]">
                  <b className="font-semibold">{title}:</b> {body}
                </p>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex min-w-0 flex-[1_1_340px] items-center">
          <div className="xband flex w-full flex-wrap items-center gap-6">
            <Bulb className="bulb dood hide-sm" style={{ right: 22, top: -30 }} />
            <span className="tile h-[84px]! w-[84px]! flex-none" style={{ transform: "rotate(-4deg)" }}>
              <Laptop size={38} strokeWidth={1.6} aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-[1_1_180px] flex-col items-start gap-4">
              <p className="text-[17px] leading-[25px]">You set your prices and availability for your Learning Experiences.</p>
              <Link className="opill ink lg" href="/pricing">
                See the fees
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="page-wrap flex flex-wrap items-center gap-x-12 gap-y-8 pb-24" aria-labelledby="before-h">
        <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <h2 id="before-h" className="mk">
              Before you <span className="hl t2">apply</span>
            </h2>
            <Spark className="spark sm hide-sm" />
          </div>
          <p className="max-w-[700px] text-[16px] leading-[25px]">
            Please have your identity document and relevant evidence of your qualifications or professional experience ready. You should also
            be prepared to attend a short online onboarding meeting if invited.
          </p>
          <p className="max-w-[700px] text-[16px] leading-[25px]">
            Once approved, you can access your Expert Dashboard, complete your public profile, upload your mandatory introduction video and
            create your Learning Experiences.
          </p>
          <p className="help max-w-[700px]">
            Teachers in full-time TSC employment may not take other paid work, so every applicant declares their employment.
          </p>
        </div>
        <div className="flex flex-[0_1_300px] flex-col items-start gap-3 lg:items-center">
          <ApplyButton />
          <p className="text-[14px] leading-[20px] text-ink-2">Your expertise can create someone’s next opportunity.</p>
        </div>
      </section>
    </>
  );
}
