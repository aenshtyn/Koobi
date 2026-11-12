"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Info, Pencil, Send } from "lucide-react";
import {
  ACHIEVEMENT_WORDS,
  AUDIENCES,
  BIO_WORDS,
  COUNTRIES,
  EDUCATION_LEVELS,
  EXPERIENCE_BANDS,
  FORMAT_LABELS,
  OUTCOME_CHARS,
  SPECIALISATION_CHARS,
  audienceLabel,
  categoryLabel,
  countryLabel,
  experienceLabel,
  wordCount,
  type Application,
} from "@/domain/expert";
import { EMPLOYMENT, LANGUAGES, OFFER_FORMATS } from "@/domain/listing-input";
import { CATEGORIES } from "@/domain/taxonomy";
import { brand } from "@/config/brand";
import { DocumentAdder, DocumentList, PhotoUploader, type DocRow } from "@/components/expert/uploaders";
import { saveStep, submitApplication, type StepState } from "./actions";

export const STEPS = ["Personal information", "Professional background", "Your expertise", "Verification and documentation", "Review and submit"] as const;

/** The five numbered steps. A step can be opened once the one before it has been saved. */
export function Stepper({ current, reached }: { current: number; reached: number }) {
  return (
    <ol className="flex items-start" aria-label="Application steps">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current || (n < reached && n !== current);
        const open = n <= reached && n !== current;
        const dot = (
          <span
            className={`flex h-9 w-9 flex-none items-center justify-center rounded-full border-[1.5px] text-[15px] font-semibold ${
              n === current ? "border-ink bg-ink text-white" : done ? "border-forest bg-forest text-white" : "border-line-2 bg-card text-ink-2"
            }`}
          >
            {done ? <Check size={18} aria-hidden="true" /> : n}
          </span>
        );
        const text = <span className={`hidden text-center text-[13px] leading-4 sm:block ${n === current ? "font-semibold text-ink" : "text-ink-2"}`}>{label}</span>;
        return (
          <li key={label} className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5" aria-current={n === current ? "step" : undefined}>
            {i > 0 ? <span className={`absolute top-[17px] right-1/2 -z-0 h-[2px] w-full ${n <= reached ? "bg-forest" : "bg-line-2"}`} aria-hidden="true" /> : null}
            {open ? (
              <Link href={`/teach/apply?step=${n}`} className="relative z-10 flex flex-col items-center gap-1.5 text-ink no-underline" aria-label={`Step ${n}: ${label}`}>
                {dot}
                {text}
              </Link>
            ) : (
              <span className="relative z-10 flex flex-col items-center gap-1.5">
                {dot}
                {text}
                <span className="sr-only sm:hidden">{label}</span>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Err({ state, name }: { state: StepState; name: string }) {
  const msg = state.errors?.[name];
  return msg ? (
    <p className="field-error" role="alert">
      {msg}
    </p>
  ) : null;
}

const Req = () => (
  <span className="text-orange" aria-hidden="true">
    {" "}
    *
  </span>
);
const Optional = () => <span className="font-normal text-ink-2"> (optional)</span>;

function Footer({ back, pending, label = "Continue", icon = "arrow" }: { back?: string; pending: boolean; label?: string; icon?: "arrow" | "send" }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2.5 rounded-[14px] bg-orange-wash px-4 py-3 text-[15px]">
        <Info size={18} aria-hidden="true" className="flex-none text-ink" />
        Your progress is saved each time you continue. You can leave and come back.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {back ? (
          <Link className="btn2 ink" href={back}>
            <ArrowLeft size={18} aria-hidden="true" />
            Back
          </Link>
        ) : (
          <Link className="btn2 ink" href="/home">
            Cancel
          </Link>
        )}
        <button className="btn" type="submit" disabled={pending}>
          {icon === "send" ? <Send size={18} aria-hidden="true" /> : null}
          {pending ? "Saving…" : label}
          {icon === "arrow" ? <ArrowRight size={18} aria-hidden="true" /> : null}
        </button>
      </div>
    </div>
  );
}

function FormError({ state }: { state: StepState }) {
  const count = Object.keys(state.errors ?? {}).length;
  if (!state.error && !count) return null;
  return (
    <p className="panel error" role="alert">
      {state.error ?? (count === 1 ? "One field needs your attention." : `${count} fields need your attention.`)}
    </p>
  );
}

function Counter({ n, max, unit }: { n: number; max: number; unit: string }) {
  return (
    <span className={`mono self-end text-[13px] ${n > max ? "text-error" : "text-ink-2"}`}>
      {n}/{max} {unit}
    </span>
  );
}

/** Text kept in state, because React resets a form's fields after every server action. */
function useFields<T extends Record<string, string>>(initial: T) {
  const [v, setV] = useState(initial);
  const bind = (k: keyof T & string) => ({
    id: k,
    name: k,
    value: v[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value })),
  });
  return { v, bind };
}

function useChecks(initial: string[]) {
  const [list, setList] = useState(initial);
  const toggle = (code: string) => setList((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));
  return { list, toggle };
}

// ---------------------------------------------------------------------------
// Step 1

export function Step1({ app, email }: { app: Application; email: string | null }) {
  const [state, action, pending] = useActionState(saveStep, {});
  const { v, bind } = useFields({
    display_name: app.display_name === "New expert" ? "" : (app.display_name ?? ""),
    contact_phone: app.contact_phone ?? "",
    country_code: app.country_code ?? "KE",
    city: app.city ?? "",
  });
  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="step" value="1" />
      <section className="card flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="t2">Personal information</h2>
          <p className="help">Used to verify your identity and to create your expert profile. Your phone number and email are never shown publicly.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="field">
            <label className="label" htmlFor="display_name">
              Full legal name
              <Req />
            </label>
            <input className="input" {...bind("display_name")} maxLength={80} autoComplete="name" placeholder="As on your ID or passport" required />
            <Err state={state} name="display_name" />
          </div>
          <div className="field">
            <label className="label" htmlFor="email">
              Email address
            </label>
            <input id="email" className="input bg-sand!" value={email ?? ""} readOnly aria-describedby="email-help" />
            <p id="email-help" className="help">
              {email ? "The email you signed in with. We write to you here." : "Add an email in your account settings so we can write to you."}
            </p>
          </div>
          <div className="field">
            <label className="label" htmlFor="contact_phone">
              Phone number
              <Req />
            </label>
            <input className="input mono" {...bind("contact_phone")} type="tel" inputMode="tel" autoComplete="tel" placeholder="+254 712 345 678" required />
            <Err state={state} name="contact_phone" />
          </div>
          <div className="field">
            <label className="label" htmlFor="country_code">
              Country of residence
              <Req />
            </label>
            <span className="sel block">
              <select className="select" {...bind("country_code")} required>
                {COUNTRIES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </span>
            <Err state={state} name="country_code" />
          </div>
          <div className="field">
            <label className="label" htmlFor="city">
              City
              <Req />
            </label>
            <input className="input" {...bind("city")} maxLength={80} autoComplete="address-level2" placeholder="Nairobi" required />
            <Err state={state} name="city" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="label">
            Profile photo
            <Req />
          </span>
          <PhotoUploader url={app.photo_url} name={v.display_name} error={state.errors?.photo} />
        </div>
      </section>
      <FormError state={state} />
      <Footer pending={pending} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 2

export function Step2({ app }: { app: Application }) {
  const [state, action, pending] = useActionState(saveStep, {});
  const { v, bind } = useFields({
    headline: app.headline ?? "",
    bio: app.bio ?? "",
    education_level: app.education_level ?? "",
    education_field: app.education_field ?? "",
    experience_band: app.experience_band ?? "",
    achievements: app.achievements ?? "",
    employment_status: app.employment_status ?? "",
    employer: app.employer ?? "",
    website_url: app.website_url ?? "",
  });
  const words = wordCount(v.bio);
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="step" value="2" />
      <section className="card flex flex-col gap-3 p-5 sm:p-6">
        <div className="field">
          <label className="label" htmlFor="headline">
            Professional title
            <Req />
          </label>
          <p className="help">Your professional role or current area of work.</p>
          <input className="input" {...bind("headline")} maxLength={140} placeholder="English Teacher, Business Consultant, IELTS Trainer" required />
          <Err state={state} name="headline" />
        </div>
      </section>
      <section className="card flex flex-col gap-3 p-5 sm:p-6">
        <div className="field">
          <label className="label" htmlFor="bio">
            Professional biography
            <Req />
          </label>
          <p className="help">
            {BIO_WORDS.min} to {BIO_WORDS.max} words. This appears on your public expert profile after approval. No phone numbers or links: contact stays inside {brand.name}.
          </p>
          <textarea className="input min-h-[200px]!" {...bind("bio")} placeholder="Your professional journey, your achievements and what makes your teaching different." required />
          <span className={`mono self-end text-[13px] ${words > BIO_WORDS.max || (words > 0 && words < BIO_WORDS.min) ? "text-error" : "text-ink-2"}`}>
            {words}/{BIO_WORDS.max} words{words < BIO_WORDS.min ? `, at least ${BIO_WORDS.min}` : ""}
          </span>
          <Err state={state} name="bio" />
        </div>
      </section>
      <section className="card flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="t3">
            Education
            <Optional />
          </h2>
          <p className="help">Formal education is not required for every expert category.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="field">
            <label className="label" htmlFor="education_level">
              Highest level of education
            </label>
            <span className="sel block">
              <select className="select" {...bind("education_level")}>
                <option value="">Select a level</option>
                {EDUCATION_LEVELS.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </span>
            <Err state={state} name="education_level" />
          </div>
          <div className="field">
            <label className="label" htmlFor="education_field">
              Field of study or qualification
            </label>
            <input className="input" {...bind("education_field")} maxLength={120} placeholder="Computer Science, Business Administration" />
            <Err state={state} name="education_field" />
          </div>
        </div>
      </section>
      <section className="card flex flex-col gap-5 p-5 sm:p-6">
        <h2 className="t3">Professional experience</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="field">
            <label className="label" htmlFor="experience_band">
              Years of professional experience
              <Req />
            </label>
            <span className="sel block">
              <select className="select" {...bind("experience_band")} required>
                <option value="">Select your experience</option>
                {EXPERIENCE_BANDS.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </span>
            <Err state={state} name="experience_band" />
          </div>
          <div className="field">
            <label className="label" htmlFor="employment_status">
              Current employment
              <Req />
            </label>
            <span className="sel block">
              <select className="select" {...bind("employment_status")} required>
                <option value="">Choose one</option>
                {EMPLOYMENT.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </span>
            <p className="help">The TSC Code of Conduct bars teachers in full-time TSC employment from other paid work.</p>
            <Err state={state} name="employment_status" />
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="achievements">
            Work experience and achievements
            <Req />
          </label>
          <p className="help">Your key roles, achievements and skills. One per line reads best: each line becomes a point on your profile.</p>
          <textarea className="input min-h-[140px]!" {...bind("achievements")} placeholder={"Ten years of business consulting for small firms\nTrained more than 200 entrepreneurs in bookkeeping"} required />
          <Counter n={wordCount(v.achievements)} max={ACHIEVEMENT_WORDS} unit="words" />
          <Err state={state} name="achievements" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="field">
            <label className="label" htmlFor="employer">
              Current organisation or employer
              <Optional />
            </label>
            <input className="input" {...bind("employer")} maxLength={120} placeholder="ABC Learning Centre, Independent Consultant" />
            <Err state={state} name="employer" />
          </div>
          <div className="field">
            <label className="label" htmlFor="website_url">
              Professional website, portfolio or LinkedIn
              <Optional />
            </label>
            <input className="input" {...bind("website_url")} type="url" inputMode="url" maxLength={300} placeholder="https://" />
            <p className="help">For our verification only. It is not shown to learners.</p>
            <Err state={state} name="website_url" />
          </div>
        </div>
      </section>
      <FormError state={state} />
      <Footer back="/teach/apply?step=1" pending={pending} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 3

export function Step3({ app }: { app: Application }) {
  const [state, action, pending] = useActionState(saveStep, {});
  const { v, bind } = useFields({
    primary_category: app.primary_category ?? "",
    specialisations: app.specialisations.join(", "),
    learner_outcomes: app.learner_outcomes ?? "",
  });
  const audiences = useChecks(app.audiences);
  const languages = useChecks(app.languages.length ? app.languages : ["en"]);
  const formats = useChecks(app.formats_offered);
  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="step" value="3" />
      <section className="card flex flex-col gap-6 p-5 sm:p-6">
        <div className="field">
          <label className="label" htmlFor="primary_category">
            Primary category
            <Req />
          </label>
          <span className="sel block">
            <select className="select" {...bind("primary_category")} required>
              <option value="">Select a category</option>
              {CATEGORIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </span>
          <Err state={state} name="primary_category" />
        </div>
        <div className="field">
          <label className="label" htmlFor="specialisations">
            Specialisations
            <Req />
          </label>
          <p className="help">Up to eight, separated by commas.</p>
          <textarea className="input min-h-[84px]!" {...bind("specialisations")} placeholder="Financial Management, IELTS Preparation, Project Management, Graphic Design, Mathematics" required />
          <Counter n={v.specialisations.length} max={SPECIALISATION_CHARS} unit="characters" />
          <Err state={state} name="specialisations" />
        </div>
        <fieldset className="flex flex-col gap-2.5">
          <legend className="label mb-1">
            Who do you work with?
            <Req />
          </legend>
          <p className="help">Select every group that fits.</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {AUDIENCES.map(([code, label]) => (
              <label key={code} className="option">
                <input type="checkbox" name="audiences" value={code} checked={audiences.list.includes(code)} onChange={() => audiences.toggle(code)} />
                {label}
              </label>
            ))}
          </div>
          <Err state={state} name="audiences" />
        </fieldset>
        <fieldset className="flex flex-col gap-2.5">
          <legend className="label mb-1">
            Languages of delivery
            <Req />
          </legend>
          <p className="help">Languages you can run your sessions in.</p>
          <div className="flex flex-wrap gap-2.5">
            {LANGUAGES.map(([code, label]) => (
              <label key={code} className="option">
                <input type="checkbox" name="languages" value={code} checked={languages.list.includes(code)} onChange={() => languages.toggle(code)} />
                {label}
              </label>
            ))}
          </div>
          <Err state={state} name="languages" />
        </fieldset>
        <fieldset className="flex flex-col gap-2.5">
          <legend className="label mb-1">
            Learning formats you offer
            <Req />
          </legend>
          <p className="help">All formats are online for now.</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {OFFER_FORMATS.map((code) => (
              <label key={code} className="option">
                <input type="checkbox" name="formats_offered" value={code} checked={formats.list.includes(code)} onChange={() => formats.toggle(code)} />
                {FORMAT_LABELS[code]}
              </label>
            ))}
          </div>
          <Err state={state} name="formats_offered" />
        </fieldset>
        <div className="field">
          <label className="label" htmlFor="learner_outcomes">
            What can learners achieve with you?
            <Req />
          </label>
          <textarea className="input min-h-[96px]!" {...bind("learner_outcomes")} placeholder="Improve their English, gain practical skills, reach their career goals." required />
          <Counter n={v.learner_outcomes.length} max={OUTCOME_CHARS} unit="characters" />
          <Err state={state} name="learner_outcomes" />
        </div>
      </section>
      <FormError state={state} />
      <Footer back="/teach/apply?step=2" pending={pending} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 4

function DocSection({ n, title, tag, required, text, children }: { n: number; title: string; tag: string; required?: boolean; text: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-b border-dashed border-line-2 pb-6 last:border-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span className="stepn flex-none">{n}</span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="t3 flex flex-wrap items-center gap-2">
            {title}
            <span className={`pill ${required ? "bg-forest-tint text-forest-ink" : "bg-sand text-ink"}`}>{tag}</span>
          </h2>
          <p className="help">{text}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function Step4({ app, docs }: { app: Application; docs: DocRow[] }) {
  const [state, action, pending] = useActionState(saveStep, {});
  const [links, setLinks] = useState<string[]>([...app.portfolio_links, "", "", ""].slice(0, Math.max(3, app.portfolio_links.length)));
  const of = (k: string) => docs.filter((d) => d.kind === k);
  const identity = of("identity");
  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="step" value="4" />
      <div className="card flex flex-col gap-6 p-5 sm:p-6">
        <DocSection n={1} title="Identity verification" tag="Required" required text="A clear copy of your national ID or passport. Only our reviewers see it.">
          <DocumentList rows={identity} canRemove />
          {identity.some((d) => d.status !== "rejected") ? null : <DocumentAdder kind="identity" button="Upload identification document" error={state.errors?.identity} />}
        </DocSection>
        <DocSection n={2} title="Educational qualifications" tag="Optional" text="University degrees, diplomas and academic certificates relevant to what you teach.">
          <DocumentList rows={of("education")} canRemove />
          <DocumentAdder kind="education" button="Add a document" />
        </DocSection>
        <DocSection n={3} title="Professional certifications and licences" tag="Optional, where applicable" text="Teaching certifications, professional licences and industry accreditation.">
          <DocumentList rows={[...of("certification"), ...of("licence")]} canRemove />
          <DocumentAdder kind="certification" button="Add a document" />
        </DocSection>
        <DocSection n={4} title="Portfolio or supporting evidence" tag="Optional" text="Links to a portfolio, a website, published work or case studies. For our review only.">
          <div className="flex flex-col gap-2.5">
            {links.map((l, i) => (
              <input
                key={i}
                name="portfolio_links"
                className="input"
                type="url"
                inputMode="url"
                value={l}
                onChange={(e) => setLinks((s) => s.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder="https://"
                aria-label={`Portfolio or website link ${i + 1}`}
                maxLength={300}
              />
            ))}
            <Err state={state} name="portfolio_links" />
          </div>
        </DocSection>
      </div>
      <p className="panel">You do not need a university degree to become an expert on {brand.name}. We welcome practitioners whose expertise comes from practical experience, professional training or formal education.</p>
      <FormError state={state} />
      <Footer back="/teach/apply?step=3" pending={pending} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 5

function Summary({ n, title, lines, ok }: { n: number; title: string; lines: (string | null)[]; ok: boolean }) {
  return (
    <li className="flex items-start gap-4 border-b border-dashed border-line-2 py-4 last:border-0">
      <span className={`stepn flex-none ${ok ? "bg-forest! text-white!" : ""}`}>{ok ? <Check size={18} aria-label="Complete" /> : n}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="t3">
          {n}. {title}
        </h2>
        {lines.filter(Boolean).map((l, i) => (
          <p key={i} className="line-clamp-2 text-[15px] text-ink-2">
            {l}
          </p>
        ))}
        {!ok ? <p className="field-error">Not complete yet.</p> : null}
      </div>
      <Link className="btn3 flex-none" href={`/teach/apply?step=${n}`}>
        <Pencil size={16} aria-hidden="true" />
        Edit
      </Link>
    </li>
  );
}

export function Review({ app, email, docs, complete }: { app: Application; email: string | null; docs: DocRow[]; complete: [boolean, boolean, boolean, boolean] }) {
  const [state, action, pending] = useActionState(submitApplication, {});
  const [agree, setAgree] = useState(false);
  const count = (k: string) => docs.filter((d) => d.kind === k && d.status !== "rejected").length;
  const allDone = complete.every(Boolean);
  const docCards = [
    { label: "ID document", n: count("identity"), required: true },
    { label: "Qualifications", n: count("education"), required: false },
    { label: "Certifications", n: count("certification") + count("licence"), required: false },
    { label: "Portfolio links", n: app.portfolio_links.length, required: false },
  ];
  return (
    <form action={action} className="flex flex-col gap-6">
      <div className="card flex flex-col p-5 sm:p-6">
        <ol className="flex flex-col">
          <Summary n={1} title="Personal information" ok={complete[0]} lines={[[app.display_name, email, app.contact_phone].filter(Boolean).join(" · "), [countryLabel(app.country_code), app.city].filter(Boolean).join(", ")]} />
          <Summary n={2} title="Professional background" ok={complete[1]} lines={[[app.headline, experienceLabel(app.experience_band)].filter(Boolean).join(" · "), app.bio ? `${wordCount(app.bio)}-word biography` : null]} />
          <Summary
            n={3}
            title="Your expertise"
            ok={complete[2]}
            lines={[[categoryLabel(app.primary_category), ...app.specialisations].filter(Boolean).join(", "), app.audiences.length ? `Working with: ${app.audiences.map(audienceLabel).join(", ")}` : null]}
          />
          <Summary n={4} title="Verification and documentation" ok={complete[3]} lines={[`ID: ${count("identity") ? "uploaded" : "missing"} · Qualifications: ${count("education") || "none"} · Certifications: ${count("certification") + count("licence") || "none"}`]} />
        </ol>
        <section className="mt-4 rounded-[16px] bg-forest-wash p-4" aria-labelledby="docs-h">
          <h2 id="docs-h" className="t3 mb-3">
            Your documents
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {docCards.map((d) => (
              <li key={d.label} className="flex flex-col gap-0.5 text-[15px]">
                <span className="font-semibold">{d.label}</span>
                <span className={d.n ? "text-forest-ink" : d.required ? "text-error" : "text-ink-2"}>{d.n ? (d.n === 1 ? "1 uploaded" : `${d.n} uploaded`) : d.required ? "Missing" : "None (optional)"}</span>
              </li>
            ))}
          </ul>
        </section>
        <div className="panel mt-4 flex-col! items-start!">
          <p className="font-semibold">Important</p>
          <p>By submitting this application you confirm that all information provided is accurate, and you authorise {brand.name} to verify your details. Submitting an application does not guarantee approval.</p>
        </div>
        <label className="check mt-4 items-start!">
          <input type="checkbox" name="agree" className="mt-0.5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank">
              terms
            </Link>{" "}
            and confirm that the information provided, including my current employment, is true and correct.
          </span>
        </label>
        <Err state={state} name="agree" />
      </div>
      {!allDone ? (
        <p className="panel error" role="alert">
          Some steps are not complete. Open them with Edit, then come back to submit.
        </p>
      ) : null}
      {state.error ? (
        <p className="panel error" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link className="btn2 ink" href="/teach/apply?step=4">
          <ArrowLeft size={18} aria-hidden="true" />
          Back
        </Link>
        <button className="btn" type="submit" disabled={pending || !allDone}>
          <Send size={18} aria-hidden="true" />
          {pending ? "Submitting…" : "Submit application"}
        </button>
      </div>
    </form>
  );
}
