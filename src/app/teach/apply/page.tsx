import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Guarded } from "@/components/app/shell";
import { applicationEditable, stepsComplete, type Application } from "@/domain/expert";
import { getSessionUser } from "@/lib/auth";
import { getCredentials, getMyApplication } from "@/lib/data/expert";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { Review, Step1, Step2, Step3, Step4, Stepper } from "./steps";

export const metadata: Metadata = { title: "Expert application" };

const TITLES = [
  { title: "Expert Application", text: "Join Koobi and start sharing your knowledge with learners in Kenya and abroad." },
  { title: "Professional Background", text: "Tell us about your professional journey, education and experience." },
  { title: "Your Expertise", text: "The subjects, skills and professional areas you can help learners develop." },
  { title: "Verification & Supporting Documents", text: "Documents that help us verify your identity and, where it applies, your qualifications and experience." },
  { title: "Review & Submit", text: "Check your information below. You can go back to make changes." },
];

const EMPTY: Application = {
  display_name: null, contact_phone: null, country_code: null, city: null, photo_url: null, headline: null, bio: null, education_level: null,
  education_field: null, experience_band: null, achievements: null, employment_status: null, employer: null, website_url: null,
  primary_category: null, specialisations: [], audiences: [], languages: [], formats_offered: [], learner_outcomes: null, portfolio_links: [],
};

export default function ApplyPage(props: PageProps<"/teach/apply">) {
  return (
    <Guarded next="/teach/apply">
      <Apply searchParams={props.searchParams} />
    </Guarded>
  );
}

async function accountEmail(): Promise<string | null> {
  if (!hasSupabase) return null;
  const db = await serverClient();
  const { data } = await db.auth.getUser();
  return data.user?.email ?? null;
}

async function Apply({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, { ready, app }, user, email] = await Promise.all([searchParams, getMyApplication(), getSessionUser(), accountEmail()]);
  if (!ready) {
    return (
      <div className="flex max-w-[640px] flex-col gap-4">
        <h1 className="t1">Expert Application</h1>
        <p className="panel info" role="note">
          {user?.dev ? "This screen needs the database. Add the Supabase keys to .env.local." : "The expert application is being switched on. Please come back shortly."}
        </p>
      </div>
    );
  }
  if (app && !applicationEditable(app.application_status)) redirect(app.application_status === "approved" ? "/teach" : "/teach/apply/status");

  const docs = app ? await getCredentials(app.id) : [];
  const data: Application = app ?? { ...EMPTY, display_name: user?.name ?? null, contact_phone: user?.phone ?? null };
  const complete = stepsComplete(data, docs.some((d) => d.kind === "identity" && d.status !== "rejected"));
  // A step opens once every step before it is complete.
  const firstOpen = complete.findIndex((c) => !c);
  const reached = firstOpen === -1 ? 5 : firstOpen + 1;
  const asked = Number(sp.step);
  const step = Number.isInteger(asked) && asked >= 1 && asked <= 5 ? Math.min(asked, reached) : Math.min(reached, Math.max(1, app?.application_step ?? 1));
  const head = TITLES[step - 1];

  return (
    <div className="flex max-w-[860px] flex-col gap-7">
      <Stepper current={step} reached={reached} />
      {app?.application_status === "more_info" && app.application_note ? (
        <div className="panel error flex-col! items-start!" role="alert">
          <p className="font-semibold">We need a little more before we can decide</p>
          <p className="whitespace-pre-line">{app.application_note}</p>
          <p>Make the change, then submit again from step 5.</p>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <h1 className="t1">{head.title}</h1>
        <p className="text-ink-2">{head.text}</p>
      </div>
      {step === 1 ? <Step1 key="1" app={data} email={email} /> : null}
      {step === 2 ? <Step2 key="2" app={data} /> : null}
      {step === 3 ? <Step3 key="3" app={data} /> : null}
      {step === 4 ? <Step4 key="4" app={data} docs={docs} /> : null}
      {step === 5 ? <Review key="5" app={data} email={email} docs={docs} complete={complete} /> : null}
    </div>
  );
}
