"use client";
import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Save, Send, UploadCloud, Video as VideoIcon } from "lucide-react";
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
  VIDEO,
  wordCount,
  type Application,
} from "@/domain/expert";
import { LANGUAGES, OFFER_FORMATS } from "@/domain/listing-input";
import { CATEGORIES } from "@/domain/taxonomy";
import { startUpload } from "@/app/teach/apply/actions";
import { putFile, videoSeconds } from "@/components/expert/direct-upload";
import { publishProfile, saveBasic, saveProfessional, saveVideo, type ProfileState } from "./actions";

function Err({ state, name }: { state: ProfileState; name: string }) {
  const msg = state.errors?.[name];
  return msg ? (
    <p className="field-error" role="alert">
      {msg}
    </p>
  ) : null;
}

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

function SaveBar({ pending, state }: { pending: boolean; state: ProfileState }) {
  const count = Object.keys(state.errors ?? {}).length;
  return (
    <div className="flex flex-col gap-3 border-t border-dashed border-line-2 pt-5">
      {state.error || count ? (
        <p className="panel error" role="alert">
          {state.error ?? (count === 1 ? "One field needs your attention." : `${count} fields need your attention.`)}
        </p>
      ) : null}
      <p className="help">Changes to what learners see are reviewed by Koobi first. Your current profile stays as it is until they are approved.</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link className="btn2 ink" href="/teach/profile">
          Cancel
        </Link>
        <button className="btn" type="submit" disabled={pending}>
          <Save size={18} aria-hidden="true" />
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

/** The draft is what is live plus any change still waiting for review. */
export function BasicForm({ draft, email }: { draft: Application; email: string | null }) {
  const [state, action, pending] = useActionState(saveBasic, {});
  const { bind } = useFields({
    display_name: draft.display_name ?? "",
    headline: draft.headline ?? "",
    country_code: draft.country_code ?? "KE",
    city: draft.city ?? "",
    contact_phone: draft.contact_phone ?? "",
  });
  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="field">
        <label className="label" htmlFor="display_name">
          Full legal name
        </label>
        <p className="help">A change to your legal name needs your identity to be verified again.</p>
        <input className="input" {...bind("display_name")} maxLength={80} required />
        <Err state={state} name="display_name" />
      </div>
      <div className="field">
        <label className="label" htmlFor="headline">
          Professional title
        </label>
        <input className="input" {...bind("headline")} maxLength={140} required />
        <Err state={state} name="headline" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="field">
          <label className="label" htmlFor="country_code">
            Country
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
          </label>
          <input className="input" {...bind("city")} maxLength={80} required />
          <p className="help">Private. Only your country shows on your profile.</p>
          <Err state={state} name="city" />
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="field">
          <label className="label flex items-center gap-1.5" htmlFor="email">
            <Lock size={15} aria-hidden="true" /> Email address
          </label>
          <input id="email" className="input bg-sand!" value={email ?? "Not added"} readOnly />
          <p className="help">
            Private, never on your public profile. Change it in <Link href="/account/settings">account settings</Link>.
          </p>
        </div>
        <div className="field">
          <label className="label flex items-center gap-1.5" htmlFor="contact_phone">
            <Lock size={15} aria-hidden="true" /> Phone number
          </label>
          <input className="input mono" {...bind("contact_phone")} type="tel" inputMode="tel" required />
          <p className="help">Private, never on your public profile.</p>
          <Err state={state} name="contact_phone" />
        </div>
      </div>
      <SaveBar pending={pending} state={state} />
    </form>
  );
}

export function ProfessionalForm({ draft }: { draft: Application }) {
  const [state, action, pending] = useActionState(saveProfessional, {});
  const { v, bind } = useFields({
    bio: draft.bio ?? "",
    education_level: draft.education_level ?? "",
    education_field: draft.education_field ?? "",
    experience_band: draft.experience_band ?? "",
    achievements: draft.achievements ?? "",
    employer: draft.employer ?? "",
    website_url: draft.website_url ?? "",
    primary_category: draft.primary_category ?? "",
    specialisations: draft.specialisations.join(", "),
    learner_outcomes: draft.learner_outcomes ?? "",
  });
  const audiences = useChecks(draft.audiences);
  const languages = useChecks(draft.languages);
  const formats = useChecks(draft.formats_offered);
  const words = wordCount(v.bio);
  return (
    <form action={action} className="flex flex-col gap-6">
      <div className="field">
        <label className="label" htmlFor="bio">
          Biography
        </label>
        <p className="help">
          {BIO_WORDS.min} to {BIO_WORDS.max} words. No phone numbers or links.
        </p>
        <textarea className="input min-h-[200px]!" {...bind("bio")} required />
        <span className={`mono self-end text-[13px] ${words > BIO_WORDS.max || words < BIO_WORDS.min ? "text-error" : "text-ink-2"}`}>
          {words}/{BIO_WORDS.max} words
        </span>
        <Err state={state} name="bio" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="field">
          <label className="label" htmlFor="experience_band">
            Years of professional experience
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
          <label className="label" htmlFor="employer">
            Current organisation or employer <span className="font-normal text-ink-2">(private)</span>
          </label>
          <input className="input" {...bind("employer")} maxLength={120} />
          <Err state={state} name="employer" />
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="achievements">
          Work experience and achievements
        </label>
        <p className="help">One per line. Each line becomes a point under Professional Background.</p>
        <textarea className="input min-h-[140px]!" {...bind("achievements")} required />
        <span className="mono self-end text-[13px] text-ink-2">
          {wordCount(v.achievements)}/{ACHIEVEMENT_WORDS} words
        </span>
        <Err state={state} name="achievements" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="field">
          <label className="label" htmlFor="education_level">
            Highest level of education <span className="font-normal text-ink-2">(optional)</span>
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
            Field of study <span className="font-normal text-ink-2">(optional)</span>
          </label>
          <input className="input" {...bind("education_field")} maxLength={120} />
          <Err state={state} name="education_field" />
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="website_url">
          Professional website, portfolio or LinkedIn <span className="font-normal text-ink-2">(private)</span>
        </label>
        <input className="input" {...bind("website_url")} type="url" inputMode="url" maxLength={300} placeholder="https://" />
        <Err state={state} name="website_url" />
      </div>

      <h2 className="t2 border-t border-dashed border-line-2 pt-6">Areas of expertise</h2>
      <div className="field">
        <label className="label" htmlFor="primary_category">
          Primary category
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
        </label>
        <p className="help">Up to eight, separated by commas.</p>
        <textarea className="input min-h-[84px]!" {...bind("specialisations")} required />
        <span className="mono self-end text-[13px] text-ink-2">
          {v.specialisations.length}/{SPECIALISATION_CHARS} characters
        </span>
        <Err state={state} name="specialisations" />
      </div>
      <fieldset className="flex flex-col gap-2.5">
        <legend className="label mb-1">Who you work with</legend>
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
        <legend className="label mb-1">Languages of delivery</legend>
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
        <legend className="label mb-1">Learning formats you offer</legend>
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
          What learners achieve with you
        </label>
        <textarea className="input min-h-[96px]!" {...bind("learner_outcomes")} required />
        <span className="mono self-end text-[13px] text-ink-2">
          {v.learner_outcomes.length}/{OUTCOME_CHARS} characters
        </span>
        <Err state={state} name="learner_outcomes" />
      </div>
      <SaveBar pending={pending} state={state} />
    </form>
  );
}

/**
 * Chooses a video, checks its type, size and length in the browser, and sends it straight to storage.
 * The server checks what arrived before recording it.
 */
export function VideoUploader({ replace }: { replace: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
    setProblem(null);
    const reset = () => {
      if (input.current) input.current.value = "";
    };
    if (!(VIDEO.types as readonly string[]).includes(file.type)) {
      reset();
      return setProblem("Use an MP4 or MOV file.");
    }
    if (file.size > VIDEO.maxBytes) {
      reset();
      return setProblem("The video is over 200 MB. Record it again at a lower quality, or trim it.");
    }
    const seconds = await videoSeconds(file);
    if (seconds === null) {
      reset();
      return setProblem("This video could not be read on your device. Try saving it as an MP4.");
    }
    if (seconds < VIDEO.minSeconds || seconds > VIDEO.maxSeconds) {
      reset();
      const m = Math.floor(seconds / 60);
      const s = String(Math.round(seconds % 60)).padStart(2, "0");
      return setProblem(`Your video is ${m}:${s} long. Keep it between 1 and 3 minutes.`);
    }
    setPct(0);
    try {
      const started = await startUpload("video", file.type, file.size);
      if (!started.target) throw new Error(started.error ?? "The upload could not start.");
      await putFile(started.target.url, file, setPct);
      const saved = await saveVideo(started.target.path, seconds);
      if (saved.error) throw new Error(saved.error);
      router.refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "The upload did not go through.");
    } finally {
      setPct(null);
      reset();
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-[18px] border-[1.5px] border-dashed border-line-2 bg-paper px-5 py-7 text-center">
      <VideoIcon size={40} aria-hidden="true" className="text-ink" />
      <input ref={input} id="video-file" type="file" accept="video/mp4,video/quicktime,.mp4,.mov" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
      {pct === null ? (
        <label htmlFor="video-file" className="btn2 ink cursor-pointer">
          <UploadCloud size={18} aria-hidden="true" />
          {replace ? "Choose another video" : "Choose video"}
        </label>
      ) : (
        <div className="flex w-full max-w-[320px] flex-col gap-2" role="status">
          <span className="h-2.5 w-full overflow-hidden rounded-full bg-sand">
            <span className="block h-full bg-forest transition-[width]" style={{ width: `${pct}%` }} />
          </span>
          <span className="text-[15px]">
            Uploading <span className="mono">{pct}%</span>. Keep this page open.
          </span>
        </div>
      )}
      <p className="help">MP4 or MOV · Maximum 200 MB · 1 to 3 minutes</p>
      {problem ? (
        <p className="field-error" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitVideoButton({ pending = false }: { pending?: boolean }) {
  return (
    <button className="btn" type="submit" disabled={pending}>
      <Send size={18} aria-hidden="true" />
      Submit for review
    </button>
  );
}

export function PublishForm() {
  const [state, action, pending] = useActionState(publishProfile, {});
  return (
    <form action={action} className="flex flex-col items-center gap-2">
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Publishing…" : "Publish my profile"}
      </button>
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
