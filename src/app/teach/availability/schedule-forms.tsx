"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Check, Copy, Plus, Trash2 } from "lucide-react";
import { ADVANCE_OPTIONS, BUFFER_OPTIONS, DAY_NAMES, MAX_RANGES_PER_DAY, NOTICE_OPTIONS, TIME_OPTIONS, WEEK_ORDER, label12, parseSchedule, type BookingPrefs, type Range } from "@/domain/schedule";
import { addExtraHours, blockDate, saveBookingPrefs, saveWeeklySchedule, type ScheduleState } from "../actions";

type Day = { on: boolean; ranges: { starts: string; ends: string }[] };
const DEFAULT = { starts: "09:00", ends: "17:00" };

function TimeSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <span className="sel">
      <select className="select mono" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {TIME_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {label12(t)}
          </option>
        ))}
      </select>
    </span>
  );
}

/** The week editor: days on or off, several ranges a day, and copying one day's hours to others. */
export function WeeklyEditor({ initial }: { initial: Range[] }) {
  const [state, action, pending] = useActionState<ScheduleState, FormData>(saveWeeklySchedule, {});
  const [days, setDays] = useState<Record<number, Day>>(() =>
    Object.fromEntries(
      WEEK_ORDER.map((d) => {
        const ranges = initial.filter((r) => r.weekday === d).map(({ starts, ends }) => ({ starts, ends }));
        return [d, { on: ranges.length > 0, ranges }];
      }),
    ),
  );
  const [from, setFrom] = useState<number>(1);
  const [targets, setTargets] = useState<number[]>([]);
  const [copied, setCopied] = useState(false);

  const set = (d: number, next: Day) => {
    setCopied(false);
    setDays((cur) => ({ ...cur, [d]: next }));
  };
  const flat: Range[] = WEEK_ORDER.flatMap((d) => (days[d].on ? days[d].ranges.map((r) => ({ weekday: d, ...r })) : []));
  const check = parseSchedule(flat);
  const problem = "error" in check ? check.error : null;

  /** The next free range after the day's last one, or the default hours on an empty day. */
  const nextRange = (day: Day) => {
    const last = day.ranges.at(-1);
    if (!last) return DEFAULT;
    const i = Math.min(TIME_OPTIONS.indexOf(last.ends) + 2, TIME_OPTIONS.length - 3);
    return { starts: TIME_OPTIONS[i], ends: TIME_OPTIONS[Math.min(i + 6, TIME_OPTIONS.length - 1)] };
  };

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <input type="hidden" name="schedule" value={JSON.stringify(flat)} />
      <section className="card flex flex-col p-5" aria-labelledby="days-h">
        <h2 id="days-h" className="t3 mb-2">
          Your working days
        </h2>
        <ul className="flex flex-col divide-y divide-dashed divide-line-2">
          {WEEK_ORDER.map((d) => {
            const day = days[d];
            return (
              <li key={d} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start">
                <label className="check w-[150px] flex-none">
                  <input
                    type="checkbox"
                    checked={day.on}
                    onChange={(e) => set(d, { on: e.target.checked, ranges: e.target.checked && !day.ranges.length ? [DEFAULT] : day.ranges })}
                  />
                  <span className="font-semibold">{DAY_NAMES[d]}</span>
                </label>
                {day.on ? (
                  <div className="flex flex-1 flex-col gap-2">
                    {day.ranges.map((r, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <TimeSelect value={r.starts} label={`${DAY_NAMES[d]} range ${i + 1} from`} onChange={(v) => set(d, { ...day, ranges: day.ranges.map((x, j) => (j === i ? { ...x, starts: v } : x)) })} />
                        <span className="text-ink-2">to</span>
                        <TimeSelect value={r.ends} label={`${DAY_NAMES[d]} range ${i + 1} to`} onChange={(v) => set(d, { ...day, ranges: day.ranges.map((x, j) => (j === i ? { ...x, ends: v } : x)) })} />
                        <button
                          type="button"
                          className="iconbtn ghost"
                          aria-label={`Remove ${DAY_NAMES[d]} range ${i + 1}`}
                          onClick={() => {
                            const ranges = day.ranges.filter((_, j) => j !== i);
                            set(d, { on: ranges.length > 0, ranges });
                          }}
                        >
                          <Trash2 size={18} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                    {day.ranges.length < MAX_RANGES_PER_DAY ? (
                      <button type="button" className="btn3 self-start" onClick={() => set(d, { ...day, ranges: [...day.ranges, nextRange(day)] })}>
                        <Plus size={16} aria-hidden="true" />
                        Add time range
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="help flex-1 sm:pt-1.5">Day off: learners cannot book this day.</p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-col gap-4">
        <section className="card flex flex-col gap-3 p-5" aria-labelledby="copy-h">
          <h2 id="copy-h" className="t3">
            Apply to other days
          </h2>
          <div className="field">
            <label className="label" htmlFor="copy-from">
              Copy the hours of
            </label>
            <span className="sel block">
              <select
                id="copy-from"
                className="select"
                value={from}
                onChange={(e) => {
                  setFrom(Number(e.target.value));
                  setTargets([]);
                }}
              >
                {WEEK_ORDER.map((d) => (
                  <option key={d} value={d}>
                    {DAY_NAMES[d]}
                  </option>
                ))}
              </select>
            </span>
          </div>
          <fieldset className="flex flex-col">
            <legend className="label mb-1">to</legend>
            {WEEK_ORDER.filter((d) => d !== from).map((d) => (
              <label key={d} className="check">
                <input type="checkbox" checked={targets.includes(d)} onChange={(e) => setTargets((cur) => (e.target.checked ? [...cur, d] : cur.filter((x) => x !== d)))} />
                {DAY_NAMES[d]}
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            className="btn2"
            disabled={!targets.length}
            onClick={() => {
              setDays((cur) => ({ ...cur, ...Object.fromEntries(targets.map((d) => [d, { on: cur[from].on, ranges: cur[from].ranges.map((r) => ({ ...r })) }])) }));
              setTargets([]);
              setCopied(true);
            }}
          >
            <Copy size={18} aria-hidden="true" />
            Apply to selected days
          </button>
          {copied ? (
            <p className="help" role="status">
              Copied. Save changes to keep it.
            </p>
          ) : null}
        </section>

        <section className="card flex flex-col gap-2.5 p-5" aria-labelledby="tips-h">
          <h2 id="tips-h" className="t3">
            Quick tips
          </h2>
          <ul className="flex flex-col gap-2 text-[15px] leading-[22px] text-ink-2">
            {["Add two ranges to leave a lunch break.", "These hours repeat every week until you change them.", "Changing them never moves or cancels a lesson already booked.", "For a holiday or a day away, block the date instead."].map((t) => (
              <li key={t} className="flex gap-2.5">
                <Check size={16} aria-hidden="true" className="mt-1 flex-none text-forest" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
        {problem || state.error ? (
          <p className="field-error w-full" role="alert">
            {problem ?? state.error}
          </p>
        ) : null}
        <button className="btn" type="submit" disabled={pending || !!problem}>
          <Check size={18} aria-hidden="true" />
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Link className="btn2 ink" href="/teach/availability">
          Cancel
        </Link>
        <span className="help">All times are Nairobi time (EAT).</span>
      </div>
    </form>
  );
}

export function BlockDateForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState<ScheduleState, FormData>(blockDate, {});
  const [whole, setWhole] = useState(true);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="field">
          <label className="label" htmlFor="block-date">
            Date
          </label>
          <input id="block-date" name="date" type="date" className="input mono" min={today} required />
        </div>
        <label className="check pb-2.5">
          <input type="checkbox" name="whole" checked={whole} onChange={(e) => setWhole(e.target.checked)} />
          The whole day
        </label>
        {!whole ? (
          <div className="flex items-center gap-2 pb-1">
            <span className="sel">
              <select name="starts" className="select mono" defaultValue="09:00" aria-label="Blocked from">
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {label12(t)}
                  </option>
                ))}
              </select>
            </span>
            <span className="text-ink-2">to</span>
            <span className="sel">
              <select name="ends" className="select mono" defaultValue="13:00" aria-label="Blocked to">
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {label12(t)}
                  </option>
                ))}
              </select>
            </span>
          </div>
        ) : null}
        <button className="btn2 mb-0.5" type="submit" disabled={pending}>
          {pending ? "Blocking…" : "Block"}
        </button>
      </div>
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

/** Open extra hours on one date, on top of the weekly hours. */
export function ExtraHoursForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState<ScheduleState, FormData>(addExtraHours, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="field">
          <label className="label" htmlFor="extra-date">
            Date
          </label>
          <input id="extra-date" name="date" type="date" className="input mono" min={today} required />
        </div>
        <div className="flex items-center gap-2 pb-1">
          <span className="sel">
            <select name="starts" className="select mono" defaultValue="09:00" aria-label="Extra hours from">
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {label12(t)}
                </option>
              ))}
            </select>
          </span>
          <span className="text-ink-2">to</span>
          <span className="sel">
            <select name="ends" className="select mono" defaultValue="12:00" aria-label="Extra hours to">
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {label12(t)}
                </option>
              ))}
            </select>
          </span>
        </div>
        <button className="btn2 mb-0.5" type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add hours"}
        </button>
      </div>
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

const hoursLabel = (h: number) => (h < 24 ? `${h} hours` : h === 24 ? "1 day" : `${h / 24} days`);

/** The expert's own booking rules. */
export function PrefsForm({ prefs }: { prefs: BookingPrefs }) {
  const [state, action, pending] = useActionState<ScheduleState, FormData>(saveBookingPrefs, {});
  const fields = [
    { name: "min_notice_hours", label: "Shortest notice", help: "Learners cannot book closer to the start than this.", options: NOTICE_OPTIONS.map((v) => [v, hoursLabel(v)] as const), value: prefs.min_notice_hours },
    { name: "advance_days", label: "How far ahead learners can book", help: "", options: ADVANCE_OPTIONS.map((v) => [v, `${v} days`] as const), value: prefs.advance_days },
    { name: "buffer_minutes", label: "Gap between lessons", help: "Kept free before and after each booked lesson.", options: BUFFER_OPTIONS.map((v) => [v, v ? `${v} minutes` : "No gap"] as const), value: prefs.buffer_minutes },
  ];
  return (
    <form action={action} className="flex flex-col gap-4">
      {fields.map((f) => (
        <div key={f.name} className="field">
          <label className="label" htmlFor={`pref-${f.name}`}>
            {f.label}
          </label>
          <span className="sel block max-w-[280px]">
            <select id={`pref-${f.name}`} name={f.name} className="select" defaultValue={f.value}>
              {f.options.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </span>
          {f.help ? <p className="help">{f.help}</p> : null}
        </div>
      ))}
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="btn2 ink self-start" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save booking rules"}
      </button>
    </form>
  );
}
