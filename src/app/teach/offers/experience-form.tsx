"use client";
import Link from "next/link";
import { Fragment, useActionState, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, CircleAlert, Clock, Globe, MapPin, MonitorPlay, Plus, Presentation, Save, Target, Trash2, Users } from "lucide-react";
import { CATEGORIES, FORMATS } from "@/domain/taxonomy";
import {
  CATEGORY_TRACKS,
  CURRICULA,
  DURATIONS,
  GROUP_DURATIONS,
  LANGUAGES,
  MAX_OWN_PACKAGES,
  MEETING_TOOLS,
  OFFER_MODES,
  OFFER_STEPS,
  PACKAGE_SIZES,
  PACKAGE_VALIDITY,
  PRICE_BANDS,
  isGroup,
  parseOfferForm,
  sessionPrice,
  stepOfField,
} from "@/domain/listing-input";
import { DEFAULT_RATES, splitSession } from "@/domain/commission";
import { formatKES } from "@/domain/format";
import { RichText } from "@/components/ui/rich-text";
import { RichTextarea } from "@/components/ui/rich-textarea";
import { saveOffer, type ActionState } from "../actions";

type Values = Record<string, string | string[] | null | undefined>;
type Bands = NonNullable<Parameters<typeof parseOfferForm>[1]>;

function Err({ errors, name }: { errors: Record<string, string>; name: string }) {
  return errors[name] ? (
    <p id={`${name}-err`} className="field-error" role="alert">
      {errors[name]}
    </p>
  ) : null;
}

const FORMAT_CHOICES = [
  { code: "one_to_one", Icon: MonitorPlay, sub: "Individual lessons and coaching" },
  { code: "small_group", Icon: Users, sub: "Teach several learners together, on set dates" },
  { code: "workshop", Icon: Presentation, sub: "A standalone practical event" },
  { code: "cohort", Icon: Target, sub: "Structured learning over several sessions" },
] as const;

const TIPS: string[][] = [
  ["Name the result, not the subject: “Excel for bookkeepers” beats “Excel”.", "The one line shows on the card in Explore. Say what the learner walks away with.", "Three to five points under “will work on” is plenty."],
  ["Online lessons run on your own Google Meet or Zoom link.", "For a group, set the fewest learners you will run it for: below that at the cut-off, everyone is credited.", "Pick the session length you can keep to every time."],
  ["One-to-one prices must sit inside the band for this kind of learning experience.", "For a group, the price is what one learner pays for all of its sessions.", "A trial costs the learner half; you are still paid the full price."],
  ["This is what learners see. Read it once as a stranger would.", "A person at Koobi reviews it, usually within two working days.", "Set your weekly hours in Availability & Schedule so learners can pick a slot."],
];

const str = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? "") : v == null ? "" : String(v));

/**
 * The four-step create and edit form (T12): Basics, Format, Pricing, Preview. It is one form, so
 * nothing typed is lost between steps and a draft can be saved from any of them. Each step is checked
 * in the browser with the same rules the server applies on save.
 */
export function ExperienceForm({ initial, live, bands, windows, editing }: { initial: Values; live: boolean; bands: Bands; windows: number; editing: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveOffer, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(editing ? OFFER_STEPS.length - 1 : 0);
  const [local, setLocal] = useState<Record<string, string>>({});
  const [snap, setSnap] = useState<FormData | null>(null);

  // When the server sends errors back, open the step that owns the first one.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    const first = Object.keys(state.errors ?? {})[0];
    if (first) setStep(stepOfField(first));
    setLocal({});
  }

  const v = (k: string) => str(state.values?.[k] ?? initial[k]);
  const list = (k: string): string[] => {
    const x = state.values ? state.values[k] : initial[k];
    return Array.isArray(x) ? x : x ? [x] : [];
  };
  const [category, setCategory] = useState(v("category") || "career_professional_growth");
  const [kind, setKind] = useState(v("kind") || "adults_professional");
  const [price, setPrice] = useState(v("price_hour_kes"));
  const [duration, setDuration] = useState(v("duration_minutes") || "60");
  const [format, setFormat] = useState(v("format") || "one_to_one");
  const group = isGroup(format);
  const [seat, setSeat] = useState(v("price_seat_kes"));
  const [sessionsCount, setSessionsCount] = useState(v("sessions_in_run") || "4");
  const [groupMax, setGroupMax] = useState(v("capacity_max"));
  const pickFormat = (code: string) => {
    setFormat(code);
    // Group sessions come in longer lengths; keep the choice valid when the format changes.
    const allowed: readonly number[] = isGroup(code) ? GROUP_DURATIONS : DURATIONS;
    if (!allowed.includes(Number(duration))) setDuration("60");
  };
  const startModes = list("modes");
  const [online, setOnline] = useState(startModes.length ? startModes.includes("online") : true);
  const langs = list("language_codes");
  const [ownPackages, setOwnPackages] = useState(v("package_mode") === "own");
  const [packageRows, setPackageRows] = useState(() => {
    let n = 1;
    for (let i = 1; i <= MAX_OWN_PACKAGES; i++) if (v(`pkg_name_${i}`) || v(`pkg_sessions_${i}`) || v(`pkg_price_${i}`)) n = i;
    return n;
  });

  const tracks = CATEGORY_TRACKS[category as keyof typeof CATEGORY_TRACKS] ?? ["adults_professional"];
  const track = tracks.length === 1 ? tracks[0] : tracks.includes(kind as never) ? kind : tracks[0];
  const band = bands[track as keyof Bands] ?? PRICE_BANDS[track as keyof typeof PRICE_BANDS];
  const hourly = Number(String(price).replace(/[,\s]/g, ""));
  const perSession = Number.isInteger(hourly) && hourly > 0 ? sessionPrice(hourly, Number(duration)) : null;
  const split = perSession ? splitSession({ priceKes: perSession, rate: DEFAULT_RATES.onlineOpening, vatRegistered: false }) : null;
  const seatPrice = Number(String(seat).replace(/[,\s]/g, ""));
  const seatSplit = group && Number.isInteger(seatPrice) && seatPrice > 0 ? splitSession({ priceKes: seatPrice, rate: DEFAULT_RATES.seat, vatRegistered: false }) : null;
  const meetings = format === "workshop" ? 1 : Math.max(1, Number(sessionsCount) || 1);
  const fullGroup = Number(String(groupMax).replace(/[,\s]/g, ""));

  const errors: Record<string, string> = { ...(state.errors ?? {}), ...local };

  /** Checks the current step with the submit rules; returns true when it may be left. */
  function checkStep(i: number): boolean {
    if (!formRef.current) return true;
    const all = parseOfferForm(new FormData(formRef.current), bands, "submit").errors;
    const mine = Object.fromEntries(Object.entries(all).filter(([k]) => (OFFER_STEPS[i].fields as readonly string[]).includes(k)));
    setLocal(mine);
    return Object.keys(mine).length === 0;
  }
  function go(to: number) {
    if (to > step && !checkStep(step)) {
      formRef.current?.querySelector<HTMLElement>("[role=alert]")?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (to === OFFER_STEPS.length - 1 && formRef.current) setSnap(new FormData(formRef.current));
    setStep(to);
    setReached((r) => Math.max(r, to));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const last = step === OFFER_STEPS.length - 1;
  const allErrors: Record<string, string> = last && snap ? parseOfferForm(snap, bands, "submit").errors : {};
  const ready = !!snap && Object.keys(allErrors).length === 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
      <form
        ref={formRef}
        action={action}
        noValidate
        className="flex min-w-0 flex-col gap-7"
        onChange={(e) => {
          // A field's message goes as soon as the field is touched again; the step is re-checked on Continue.
          const name = (e.target as unknown as { name?: string }).name;
          if (name && local[name]) setLocal((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => k !== name)));
        }}
      >
        <input type="hidden" name="id" value={v("id")} />

        <div className="steps flex-wrap" role="group" aria-label={`Step ${step + 1} of ${OFFER_STEPS.length}: ${OFFER_STEPS[step].label}`}>
          {OFFER_STEPS.map((s, i) => (
            <Fragment key={s.key}>
              {i > 0 ? <span className={`bar${i <= step ? " done" : ""}`} aria-hidden="true" /> : null}
              <span className={i < step ? "done" : i === step ? "cur" : undefined} aria-current={i === step ? "step" : undefined}>
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 font-[inherit] text-inherit disabled:cursor-default"
                  onClick={() => go(i)}
                  disabled={i > reached || i === step}
                >
                  <span className="n">{i < step ? <Check size={14} aria-label="Done" /> : i + 1}</span>
                  {s.label}
                </button>
              </span>
            </Fragment>
          ))}
        </div>

        {/* ---------------------------------------------------------------- 1 Basics */}
        <section hidden={step !== 0} className="flex flex-col gap-6" aria-labelledby="basics-h">
          <h2 id="basics-h" className="t2">
            What would you like to teach?
          </h2>
          <fieldset className="flex flex-col gap-2.5">
            <legend className="label mb-2">Format</legend>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {FORMAT_CHOICES.map((f) => (
                <label key={f.code} className={`option items-start! ${editing && format !== f.code ? "cursor-not-allowed! opacity-60" : ""}`}>
                  <input type="radio" name="format" value={f.code} checked={format === f.code} onChange={() => pickFormat(f.code)} disabled={editing && format !== f.code} className="mt-0.5" />
                  <f.Icon size={22} aria-hidden="true" className="mt-0.5 flex-none text-orange-deep" />
                  <span className="flex flex-col">
                    <span className="font-semibold">{FORMATS[f.code].label}</span>
                    <span className="help text-[14px]! leading-5!">{f.sub}</span>
                  </span>
                </label>
              ))}
            </div>
            {editing ? <p className="help">The format cannot be changed once a learning experience is created. Duplicate it to make another.</p> : null}
          </fieldset>
          <div className="field">
            <label className="label" htmlFor="title">
              Title
            </label>
            <input id="title" name="title" className="input" defaultValue={v("title")} maxLength={120} placeholder="Business English for professionals" aria-describedby={errors.title ? "title-err" : undefined} />
            <Err errors={errors} name="title" />
          </div>
          <fieldset className="flex flex-col gap-2.5">
            <legend className="label mb-2">Category</legend>
            <div className="grid gap-x-6 sm:grid-cols-2">
              {CATEGORIES.map((c) => (
                <label key={c.code} className="check">
                  <input type="radio" name="category" value={c.code} checked={category === c.code} onChange={() => setCategory(c.code)} />
                  {c.label}
                </label>
              ))}
            </div>
            <Err errors={errors} name="category" />
          </fieldset>
          {tracks.length > 1 ? (
            <fieldset className="flex flex-col gap-2.5">
              <legend className="label mb-2">What kind of skill is it?</legend>
              <label className="check">
                <input type="radio" name="kind" value="adults_professional" checked={track === "adults_professional"} onChange={() => setKind("adults_professional")} />
                Professional or digital (a desk, a laptop, an office)
              </label>
              <label className="check">
                <input type="radio" name="kind" value="practical" checked={track === "practical"} onChange={() => setKind("practical")} />
                Hands-on (farming, trades, crafts)
              </label>
            </fieldset>
          ) : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="field">
              <label className="label" htmlFor="subject_text">
                Subject or skill
              </label>
              <input id="subject_text" name="subject_text" className="input" defaultValue={v("subject_text")} maxLength={120} placeholder="Business English" />
              <Err errors={errors} name="subject_text" />
            </div>
            {track === "school" ? (
              <div className="field">
                <label className="label" htmlFor="curriculum_code">
                  Curriculum
                </label>
                <span className="sel block">
                  <select id="curriculum_code" name="curriculum_code" className="select" defaultValue={v("curriculum_code")}>
                    <option value="">Any</option>
                    {CURRICULA.map(([c, l]) => (
                      <option key={c} value={c}>
                        {l}
                      </option>
                    ))}
                  </select>
                </span>
              </div>
            ) : null}
          </div>
          <div className="field">
            <label className="label" htmlFor="summary">
              One line for the card
            </label>
            <input id="summary" name="summary" className="input" defaultValue={v("summary")} maxLength={300} placeholder="Write emails and reports that get read, and speak up in meetings." />
            <p className="help">Shown under the title in Explore. What does the learner get?</p>
            <Err errors={errors} name="summary" />
          </div>
          <div className="field">
            <label className="label" htmlFor="description">
              About this learning experience <span className="font-normal text-ink-2">(optional)</span>
            </label>
            <RichTextarea id="description" name="description" defaultValue={v("description")} maxLength={5000} placeholder="How you teach it, what a session looks like, what the learner should bring." />
            <p className="help">Use the buttons for bold, italic and lists. Do not add phone numbers, email addresses or links.</p>
            <Err errors={errors} name="description" />
          </div>
          <div className="field">
            <label className="label" htmlFor="outcomes">
              What learners will work on <span className="font-normal text-ink-2">(optional)</span>
            </label>
            <textarea id="outcomes" name="outcomes" className="input min-h-[104px]!" defaultValue={v("outcomes")} placeholder={"Emails and reports that get read\nLeading and minuting meetings"} />
            <p className="help">One point per line, up to 10.</p>
            <Err errors={errors} name="outcomes" />
          </div>
          <div className="field">
            <label className="label" htmlFor="goal">
              Who it is for <span className="font-normal text-ink-2">(optional)</span>
            </label>
            <input id="goal" name="goal" className="input" defaultValue={v("goal")} maxLength={300} placeholder="Professionals who write and present in English at work" />
            <Err errors={errors} name="goal" />
          </div>
        </section>

        {/* ---------------------------------------------------------------- 2 Format and delivery */}
        <section hidden={step !== 1} className="flex flex-col gap-6" aria-labelledby="format-h">
          <h2 id="format-h" className="t2">
            Format and delivery
          </h2>
          <fieldset className="flex flex-col gap-2.5">
            <legend className="label mb-2">Where lessons happen</legend>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {OFFER_MODES.map(([code, label]) => (
                <label key={code} className="option">
                  <input
                    type="checkbox"
                    name="modes"
                    value={code}
                    defaultChecked={startModes.length ? startModes.includes(code) : code === "online"}
                    onChange={code === "online" ? (e) => setOnline(e.target.checked) : undefined}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <Err errors={errors} name="modes" />
          </fieldset>
          {online ? (
            <div className="field max-w-[360px]">
              <label className="label" htmlFor="meeting_tool">
                Online lessons on
              </label>
              <span className="sel block">
                <select id="meeting_tool" name="meeting_tool" className="select" defaultValue={v("meeting_tool") || "google_meet"}>
                  {Object.entries(MEETING_TOOLS).map(([c, l]) => (
                    <option key={c} value={c}>
                      {l}
                    </option>
                  ))}
                </select>
              </span>
              <p className="help">{group ? "You add one meeting link for the whole group, under Group dates. Learners see it once they have paid." : "You paste your own meeting link when you accept each booking. The learner sees it only then."}</p>
              <Err errors={errors} name="meeting_tool" />
            </div>
          ) : null}
          {group ? (
            <div className="grid gap-5 sm:grid-cols-3">
              <div className="field">
                <label className="label" htmlFor="capacity_max">
                  Group size
                </label>
                <input id="capacity_max" name="capacity_max" inputMode="numeric" className="input mono" value={groupMax} onChange={(e) => setGroupMax(e.target.value)} placeholder="8" />
                <p className="help">The most learners you take.</p>
                <Err errors={errors} name="capacity_max" />
              </div>
              <div className="field">
                <label className="label" htmlFor="capacity_min">
                  Fewest to run it
                </label>
                <input id="capacity_min" name="capacity_min" inputMode="numeric" className="input mono" defaultValue={v("capacity_min") || "1"} />
                <p className="help">Below this at the cut-off, it is cancelled and learners are credited.</p>
                <Err errors={errors} name="capacity_min" />
              </div>
              {format !== "workshop" ? (
                <div className="field">
                  <label className="label" htmlFor="sessions_in_run">
                    Number of sessions
                  </label>
                  <input id="sessions_in_run" name="sessions_in_run" inputMode="numeric" className="input mono" value={sessionsCount} onChange={(e) => setSessionsCount(e.target.value)} />
                  <p className="help">One a week, same day and time.</p>
                  <Err errors={errors} name="sessions_in_run" />
                </div>
              ) : null}
            </div>
          ) : null}
          <fieldset className="flex flex-col gap-2.5">
            <legend className="label mb-2">Session length</legend>
            <div className="flex flex-wrap gap-2">
              {(group ? GROUP_DURATIONS : DURATIONS).map((d) => (
                <label key={d} className={`chip cursor-pointer${duration === String(d) ? " on" : ""}`}>
                  <input type="radio" name="duration_minutes" value={d} checked={duration === String(d)} onChange={() => setDuration(String(d))} className="sr-only" />
                  <span className="mono">{d}</span> min
                </label>
              ))}
            </div>
            <Err errors={errors} name="duration_minutes" />
          </fieldset>
          <fieldset className="flex flex-col gap-2.5">
            <legend className="label mb-2">Language of instruction</legend>
            <div className="flex flex-wrap gap-x-6">
              {LANGUAGES.map(([code, label]) => (
                <label key={code} className="check">
                  <input type="checkbox" name="language_codes" value={code} defaultChecked={langs.length ? langs.includes(code) : code === "en"} />
                  {label}
                </label>
              ))}
            </div>
            <Err errors={errors} name="language_codes" />
          </fieldset>
          <div className="panel info items-center">
            <CalendarDays size={20} aria-hidden="true" className="flex-none" />
            <p>
              {group ? (
                <>
                  <b>Dates.</b> A group meets on set dates. After you save, add them under Dates and enrolment; learners then book a seat on a date. Bookings close 24 hours before the first session.
                </>
              ) : (
                <>
                  <b>Scheduling.</b> Learners choose from your weekly hours, cut into sessions of this length.{" "}
                  {windows ? `You have ${windows} weekly ${windows === 1 ? "range" : "ranges"} set.` : "You have not set your weekly hours yet."}{" "}
                  <Link href="/teach/availability">Availability & Schedule</Link>
                </>
              )}
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- 3 Pricing */}
        <section hidden={step !== 2} className="flex flex-col gap-6" aria-labelledby="price-h">
          <h2 id="price-h" className="t2">
            Pricing
          </h2>
          {group ? (
            <div className="card flex flex-col gap-4 p-5">
              <h3 className="t3">Price per learner</h3>
              <div className="field max-w-[360px]">
                <label className="label" htmlFor="price_seat_kes">
                  {meetings > 1 ? `For all ${meetings} sessions` : "For the session"}
                </label>
                <div className="inputwrap">
                  <span className="pre">KES</span>
                  <input id="price_seat_kes" name="price_seat_kes" inputMode="numeric" className="mono" value={seat} onChange={(e) => setSeat(e.target.value)} aria-describedby="seat-help" />
                </div>
                <p id="seat-help" className="help">
                  What one learner pays to join, paid in full when they book.
                  {seatSplit && meetings > 1 ? (
                    <>
                      {" "}
                      That is <span className="mono">{formatKES(Math.round(seatPrice / meetings))}</span> a session.
                    </>
                  ) : null}
                </p>
                <Err errors={errors} name="price_seat_kes" />
              </div>
              {seatSplit ? (
                <div className="flex flex-col rounded-[14px] bg-sand px-4 py-1">
                  <div className="kv">
                    <span>Each learner pays</span>
                    <span>{formatKES(seatPrice)}</span>
                  </div>
                  <div className="kv">
                    <span>Koobi’s fee ({Math.round(DEFAULT_RATES.seat * 100)}%)</span>
                    <span>− {formatKES(seatSplit.commission)}</span>
                  </div>
                  <div className="kv">
                    <span>Withholding tax ({Math.round(DEFAULT_RATES.withholding * 100)}%, filed with KRA for you)</span>
                    <span>− {formatKES(seatSplit.withholding)}</span>
                  </div>
                  <div className="kv">
                    <span className="font-semibold text-ink!">You receive, per learner</span>
                    <span className="font-semibold">{formatKES(seatSplit.teacherNet)}</span>
                  </div>
                  {Number.isInteger(fullGroup) && fullGroup > 1 ? (
                    <div className="kv">
                      <span>
                        With a full group of <span className="mono">{fullGroup}</span>
                      </span>
                      <span>{formatKES(seatSplit.teacherNet * fullGroup)}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <p className="help">You are paid after the last session, once learners confirm it or 48 hours after your note.</p>
            </div>
          ) : null}

          <div hidden={group} className="flex flex-col gap-6">
          <div className="card flex flex-col gap-4 p-5">
            <h3 className="t3">Single session</h3>
            <div className="field max-w-[360px]">
              <label className="label" htmlFor="price_hour_kes">
                Price per hour
              </label>
              <div className="inputwrap">
                <span className="pre">KES</span>
                <input id="price_hour_kes" name="price_hour_kes" inputMode="numeric" className="mono" value={price} onChange={(e) => setPrice(e.target.value)} aria-describedby="price-help" />
              </div>
              <p id="price-help" className="help">
                Between <span className="mono">{formatKES(band.min)}</span> and <span className="mono">{formatKES(band.max)}</span> for this kind of learning experience.
              </p>
              <Err errors={errors} name="price_hour_kes" />
            </div>
            {perSession && split ? (
              <div className="flex flex-col rounded-[14px] bg-sand px-4 py-1">
                <div className="kv">
                  <span>Learners pay, per {duration}-minute session</span>
                  <span>{formatKES(perSession)}</span>
                </div>
                <div className="kv">
                  <span>Koobi’s fee ({Math.round(DEFAULT_RATES.onlineOpening * 100)}%)</span>
                  <span>− {formatKES(split.commission)}</span>
                </div>
                <div className="kv">
                  <span>Withholding tax ({Math.round(DEFAULT_RATES.withholding * 100)}%, filed with KRA for you)</span>
                  <span>− {formatKES(split.withholding)}</span>
                </div>
                <div className="kv">
                  <span className="font-semibold text-ink!">You receive</span>
                  <span className="font-semibold">{formatKES(split.teacherNet)}</span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="card flex flex-col gap-4 p-5">
            <div className="flex flex-col gap-1">
              <h3 className="t3">
                Session packages <span className="font-normal text-ink-2">(optional)</span>
              </h3>
              <p className="help">
                Learners can buy {PACKAGE_SIZES.join(", ").replace(/, (\d+)$/, " or $1")} sessions at once. Leave a price empty to charge the single-session price; set a lower one to reward
                commitment. A package runs at the learner’s chosen pace plus two weeks, and you are paid one lesson at a time.
              </p>
            </div>
            <fieldset className="grid gap-2.5 sm:grid-cols-2">
              <legend className="sr-only">Which packages to offer</legend>
              <label className="option items-start!">
                <input type="radio" name="package_mode" value="standard" checked={!ownPackages} onChange={() => setOwnPackages(false)} className="mt-0.5" />
                <span className="flex flex-col">
                  <span className="font-semibold">Standard sizes</span>
                  <span className="help text-[14px]! leading-5!">8, 12 and 16 sessions, with an optional price for each.</span>
                </span>
              </label>
              <label className="option items-start!">
                <input type="radio" name="package_mode" value="own" checked={ownPackages} onChange={() => setOwnPackages(true)} className="mt-0.5" />
                <span className="flex flex-col">
                  <span className="font-semibold">My own packages</span>
                  <span className="help text-[14px]! leading-5!">You choose the name, number of sessions, total price and how long it is valid.</span>
                </span>
              </label>
            </fieldset>
            <div hidden={ownPackages}>
              <div className="grid gap-4 sm:grid-cols-3">
                {PACKAGE_SIZES.map((n) => {
                  const key = `price_pkg${n}_kes`;
                  return (
                    <div key={n} className="field">
                      <label className="label" htmlFor={key}>
                        <span className="mono">{n}</span> sessions
                      </label>
                      <div className="inputwrap h-[50px]!">
                        <span className="pre">KES</span>
                        <input id={key} name={key} inputMode="numeric" className="mono text-[16px]!" defaultValue={v(key)} placeholder={perSession ? (perSession * n).toLocaleString("en-KE") : ""} />
                      </div>
                      {perSession ? (
                        <p className="help text-[13.5px]!">
                          Up to <span className="mono">{formatKES(perSession * n)}</span>
                        </p>
                      ) : null}
                      <Err errors={errors} name={key} />
                    </div>
                  );
                })}
              </div>
            </div>
            {ownPackages ? (
              <div className="flex flex-col gap-4">
                {Array.from({ length: packageRows }, (_, k) => k + 1).map((i) => {
                  const count = Number(String(v(`pkg_sessions_${i}`)).replace(/[,\s]/g, ""));
                  return (
                    <fieldset key={i} className="flex flex-col gap-4 rounded-[14px] border-[1.5px] border-dashed border-line-2 p-4">
                      <legend className="px-1.5 font-semibold">
                        Package <span className="mono">{i}</span>
                      </legend>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="field">
                          <label className="label" htmlFor={`pkg_name_${i}`}>
                            Package name
                          </label>
                          <input id={`pkg_name_${i}`} name={`pkg_name_${i}`} className="input" maxLength={60} defaultValue={v(`pkg_name_${i}`)} placeholder="Starter Package" />
                          <Err errors={errors} name={`pkg_name_${i}`} />
                        </div>
                        <div className="field">
                          <label className="label" htmlFor={`pkg_desc_${i}`}>
                            Description <span className="font-normal text-ink-2">(optional)</span>
                          </label>
                          <input id={`pkg_desc_${i}`} name={`pkg_desc_${i}`} className="input" maxLength={200} defaultValue={v(`pkg_desc_${i}`)} placeholder="Four sessions to get you started." />
                          <Err errors={errors} name={`pkg_desc_${i}`} />
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="field">
                          <label className="label" htmlFor={`pkg_sessions_${i}`}>
                            Number of sessions
                          </label>
                          <input id={`pkg_sessions_${i}`} name={`pkg_sessions_${i}`} inputMode="numeric" className="input mono" defaultValue={v(`pkg_sessions_${i}`)} placeholder="4" />
                          <Err errors={errors} name={`pkg_sessions_${i}`} />
                        </div>
                        <div className="field">
                          <label className="label" htmlFor={`pkg_price_${i}`}>
                            Total price
                          </label>
                          <div className="inputwrap h-[50px]!">
                            <span className="pre">KES</span>
                            <input id={`pkg_price_${i}`} name={`pkg_price_${i}`} inputMode="numeric" className="mono text-[16px]!" defaultValue={v(`pkg_price_${i}`)} />
                          </div>
                          {perSession && count >= 2 ? (
                            <p className="help text-[13.5px]!">
                              Up to <span className="mono">{formatKES(perSession * count)}</span>
                            </p>
                          ) : null}
                          <Err errors={errors} name={`pkg_price_${i}`} />
                        </div>
                        <div className="field">
                          <label className="label" htmlFor={`pkg_validity_${i}`}>
                            Valid for
                          </label>
                          <span className="sel block">
                            <select id={`pkg_validity_${i}`} name={`pkg_validity_${i}`} className="select" defaultValue={v(`pkg_validity_${i}`)}>
                              {PACKAGE_VALIDITY.map(([c, l]) => (
                                <option key={c} value={c}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          </span>
                        </div>
                      </div>
                    </fieldset>
                  );
                })}
                <div className="flex flex-wrap items-center gap-3">
                  {packageRows < MAX_OWN_PACKAGES ? (
                    <button type="button" className="btn2" onClick={() => setPackageRows((n) => n + 1)}>
                      <Plus size={18} aria-hidden="true" />
                      Add another package
                    </button>
                  ) : null}
                  {packageRows > 1 ? (
                    <button type="button" className="btn3" onClick={() => setPackageRows((n) => n - 1)}>
                      <Trash2 size={16} aria-hidden="true" />
                      Remove package <span className="mono">{packageRows}</span>
                    </button>
                  ) : null}
                </div>
                <p className="help">Koobi shows learners the price per session for each package. Your own packages replace the standard sizes.</p>
              </div>
            ) : null}
          </div>

          <div className="card flex flex-col gap-3 p-5">
            <h3 className="t3">First session</h3>
            <label className="check items-start!">
              <input type="checkbox" name="trial" defaultChecked={state.values ? state.values.trial === "on" : initial.trial === "on"} className="mt-0.5" />
              <span>
                Offer a first trial lesson at half price
                <span className="help block">The learner pays half. You are still paid on the full price; Koobi covers the difference and takes no fee on a trial.</span>
              </span>
            </label>
          </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- 4 Preview */}
        <section hidden={!last} className="flex flex-col gap-6" aria-labelledby="preview-h">
          <h2 id="preview-h" className="t2">
            Preview and submit
          </h2>
          {last ? <Preview data={snap} duration={Number(duration)} perSession={perSession} /> : null}
          <div className="card flex flex-col gap-3 p-5">
            <h3 className="t3">Before you submit</h3>
            <ul className="flex flex-col gap-2 text-[15px] leading-[22px]">
              {[
                { ok: !allErrors.title && !allErrors.summary && !allErrors.subject_text && !allErrors.category, label: "Title, subject and the one line for the card", to: 0 },
                { ok: !allErrors.modes && !allErrors.meeting_tool && !allErrors.duration_minutes && !allErrors.language_codes && !allErrors.capacity_min && !allErrors.capacity_max && !allErrors.sessions_in_run, label: group ? "Where it happens, group size, sessions and language" : "Where it happens, session length and language", to: 1 },
                { ok: !Object.keys(allErrors).some((k) => k.startsWith("price_") || k.startsWith("pkg_")), label: group ? "Price per learner" : "Price inside the band, and package prices if any", to: 2 },
              ].map((c) => (
                <li key={c.label} className="flex items-start gap-2.5">
                  {c.ok ? <Check size={18} aria-label="Done" className="mt-0.5 flex-none text-forest" /> : <CircleAlert size={18} aria-label="Missing" className="mt-0.5 flex-none text-error" />}
                  <span className="flex-1">{c.label}</span>
                  {!c.ok ? (
                    <button type="button" className="btn3 min-h-0!" onClick={() => go(c.to)}>
                      Fix
                    </button>
                  ) : null}
                </li>
              ))}
              <li className="flex items-start gap-2.5">
                {windows && !group ? <Check size={18} aria-label="Done" className="mt-0.5 flex-none text-forest" /> : <Clock size={18} aria-label="To do" className="mt-0.5 flex-none text-ink-2" />}
                <span className="flex-1">
                  {group
                    ? "Dates: add them after saving, under Dates and enrolment"
                    : windows
                      ? `Weekly hours set (${windows} ${windows === 1 ? "range" : "ranges"})`
                      : "Weekly hours: set them in Availability & Schedule, or learners cannot pick a slot"}
                </span>
              </li>
            </ul>
          </div>
          <p className="panel info">
            <span>
              <b>What happens next.</b> A person at Koobi checks it, usually within two working days. Once approved it appears on Explore, as long as your profile is approved too.
            </span>
          </p>
        </section>

        {live ? (
          <div className="panel info" role="note">
            <p>
              <b>This learning experience is published.</b> Saving changes sends it back for review and takes it off Explore until it is approved again.
            </p>
          </div>
        ) : null}
        {state.error ? (
          <p className="field-error" role="alert">
            {state.error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t-[1.5px] border-dashed border-line-2 pt-5">
          {step > 0 ? (
            <button className="btn2 ink" type="button" onClick={() => go(step - 1)}>
              <ArrowLeft size={18} aria-hidden="true" />
              Back
            </button>
          ) : null}
          <button className="btn3" type="submit" name="intent" value="draft" disabled={pending}>
            <Save size={18} aria-hidden="true" />
            {live ? "Save changes" : "Save draft"}
          </button>
          <span className="flex-1" />
          {last ? (
            // Keys keep React from turning the Continue button into this one mid-click, which would submit at once.
            <button key="submit" className="btn lg" type="submit" name="intent" value="submit" disabled={pending || !ready}>
              {pending ? "Saving…" : "Submit for review"}
            </button>
          ) : (
            <button key="next" className="btn" type="button" onClick={() => go(step + 1)}>
              Continue to {OFFER_STEPS[step + 1].label.toLowerCase()}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </form>

      <aside className="hidden lg:block" aria-label="Tips">
        <div className="card sticky top-[96px] flex flex-col gap-3 p-5">
          <h2 className="t3">Tips for this step</h2>
          <ul className="flex flex-col gap-2.5 text-[15px] leading-[22px] text-ink-2">
            {TIPS[step].map((t) => (
              <li key={t} className="flex gap-2.5">
                <Check size={16} aria-hidden="true" className="mt-1 flex-none text-forest" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

/** What a learner will see, built from the form as it stands. */
function Preview({ data, duration, perSession }: { data: FormData | null; duration: number; perSession: number | null }) {
  if (!data) return null;
  const get = (k: string) => String(data.get(k) ?? "").trim();
  const category = CATEGORIES.find((c) => c.code === get("category"));
  const modes = data.getAll("modes").map(String);
  const langs = data.getAll("language_codes").map(String);
  const outcomes = get("outcomes")
    .split("\n")
    .map((s) => s.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  const amount = (k: string) => Number(get(k).replace(/[,\s]/g, ""));
  const pkg =
    get("package_mode") === "own"
      ? Array.from({ length: MAX_OWN_PACKAGES }, (_, k) => k + 1)
          .filter((i) => data.has(`pkg_name_${i}`) && (get(`pkg_name_${i}`) || amount(`pkg_sessions_${i}`)))
          .map((i) => {
            const n = amount(`pkg_sessions_${i}`);
            const price = amount(`pkg_price_${i}`) || null;
            return { n, name: get(`pkg_name_${i}`) || "Package", price, discounted: !!price && perSession !== null && price < perSession * n };
          })
      : PACKAGE_SIZES.map((n) => {
          const raw = amount(`price_pkg${n}_kes`);
          const price = raw > 0 ? raw : perSession ? perSession * n : null;
          return { n, name: "", price, discounted: raw > 0 && perSession !== null && raw < perSession * n };
        });
  const format = get("format") || "one_to_one";
  const group = isGroup(format);
  const seatPrice = amount("price_seat_kes");
  const meetings = format === "workshop" ? 1 : Math.max(1, amount("sessions_in_run") || 1);
  const trial = !group && data.get("trial") === "on" && perSession ? perSession - Math.round(perSession * 0.5) : null;
  const where = OFFER_MODES.filter(([c]) => modes.includes(c)).map(([, l]) => l);
  return (
    <div className="card r2 flex flex-col gap-5 p-6">
      <p className="help">How learners will see it on Koobi</p>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2 text-[14px] font-semibold text-ink-2">
          <span className="pill">{FORMATS[format as keyof typeof FORMATS]?.label ?? FORMATS.one_to_one.label}</span>
          {category ? <span className="pill">{category.label}</span> : null}
        </div>
        <h3 className="t2">{get("title") || "Untitled learning experience"}</h3>
        {get("summary") ? <p className="text-ink-2">{get("summary")}</p> : null}
      </div>
      {get("description") ? (
        <div className="flex flex-col gap-1">
          <span className="label">About this learning experience</span>
          <RichText text={get("description")} />
        </div>
      ) : null}
      {outcomes.length ? (
        <div className="flex flex-col gap-1">
          <span className="label">What you will work on</span>
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {outcomes.map((o) => (
              <li key={o} className="flex gap-2">
                <Check size={16} aria-hidden="true" className="mt-1.5 flex-none text-forest" />
                {o}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {get("goal") ? (
        <p>
          <span className="label">Who it is for: </span>
          {get("goal")}
        </p>
      ) : null}
      <div className="grid gap-3 rounded-[14px] bg-sand p-4 sm:grid-cols-4">
        <span className="flex items-center gap-2">
          <Clock size={18} aria-hidden="true" />
          <span>
            <span className="mono">{duration}</span> min
          </span>
        </span>
        <span className="flex items-center gap-2">
          <MapPin size={18} aria-hidden="true" />
          {where.join(", ") || "Not chosen"}
        </span>
        <span className="flex items-center gap-2">
          <Globe size={18} aria-hidden="true" />
          {LANGUAGES.filter(([c]) => langs.includes(c)).map(([, l]) => l).join(", ") || "Not chosen"}
        </span>
        <span className="flex flex-col sm:items-end">
          <span className="mono font-medium">{group ? (seatPrice ? formatKES(seatPrice) : "No price yet") : perSession ? formatKES(perSession) : "No price yet"}</span>
          <span className="help text-[13.5px]!">
            {group ? `per learner${meetings > 1 ? `, ${meetings} sessions` : ""}` : `per session${trial ? ` · trial ${formatKES(trial)}` : ""}`}
          </span>
        </span>
      </div>
      {group ? (
        <p className="flex items-center gap-2 text-[15px]">
          <Users size={18} aria-hidden="true" className="flex-none text-ink-2" />
          <span>
            {amount("capacity_max") ? (
              <>
                Up to <span className="mono">{amount("capacity_max")}</span> learners
              </>
            ) : (
              "Group size not set"
            )}
            {amount("capacity_min") > 1 ? (
              <>
                {" "}
                · runs with <span className="mono">{amount("capacity_min")}</span> or more
              </>
            ) : null}
          </span>
        </p>
      ) : null}
      {!group && perSession && pkg.length ? (
        <div className="flex flex-col gap-2">
          <span className="label">Packages</span>
          <ul className="grid gap-2.5 sm:grid-cols-3">
            {pkg.map((p) => (
              <li key={`${p.n}-${p.name}`} className="flex flex-col rounded-[12px] border-[1.5px] border-line-2 px-3.5 py-2.5 text-[15px]">
                {p.name ? <span className="font-semibold">{p.name}</span> : null}
                <span className="whitespace-nowrap">
                  <span className="mono">{p.n}</span> sessions
                </span>
                <span className="flex flex-col">
                  <span className="mono whitespace-nowrap font-medium">{p.price ? formatKES(p.price) : "—"}</span>
                  {p.discounted ? <span className="text-[13px] leading-4 text-forest-ink">saves {formatKES(perSession * p.n - (p.price ?? 0))}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
