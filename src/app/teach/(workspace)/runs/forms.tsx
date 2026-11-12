"use client";
import { useActionState, useState } from "react";
import { CalendarPlus, Check } from "lucide-react";
import { createRun, markRunSession, runStep, setRunLink, type RunState } from "./actions";

function ErrorLine({ error }: { error?: string }) {
  return error ? (
    <p className="field-error" role="alert">
      {error}
    </p>
  ) : null;
}

/** Add dates to a group learning experience: the first session; the rest follow weekly. */
export function AddDatesForm({ offers, minDate, times, picked }: { offers: { id: string; label: string }[]; minDate: string; times: string[]; picked?: string }) {
  const [state, action, pending] = useActionState<RunState, FormData>(createRun, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="field">
          <label className="label" htmlFor="run-offer">
            Learning experience
          </label>
          <span className="sel block">
            <select id="run-offer" name="offering_id" className="select" defaultValue={picked ?? offers[0]?.id} required>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </span>
        </div>
        <div className="field">
          <label className="label" htmlFor="run-date">
            First session
          </label>
          <input id="run-date" name="date" type="date" className="input mono" min={minDate} required />
        </div>
        <div className="field">
          <label className="label" htmlFor="run-time">
            Start time
          </label>
          <span className="sel block">
            <select id="run-time" name="time" className="select mono" defaultValue="18:00" required>
              {times.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </span>
        </div>
      </div>
      <p className="help">East Africa Time. A class or programme meets once a week at the same time. Bookings close 24 hours before the first session.</p>
      <ErrorLine error={state.error} />
      <button className="btn self-start" type="submit" disabled={pending}>
        <CalendarPlus size={18} aria-hidden="true" />
        {pending ? "Adding…" : "Add dates"}
      </button>
    </form>
  );
}

/** Open a draft, confirm early, or cancel a group. */
export function RunActions({ runId, status, seats }: { runId: string; status: string; seats: number }) {
  const [state, action, pending] = useActionState<RunState, FormData>(runStep, {});
  const [cancelling, setCancelling] = useState(false);
  if (!["draft", "open", "confirmed"].includes(status)) return null;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="run_id" value={runId} />
      {status === "draft" ? <input type="hidden" name="draft" value="1" /> : null}
      {cancelling && status !== "draft" ? (
        <div className="card flex flex-col gap-4 p-5">
          <p className="panel error">
            {seats ? "Every learner who has paid gets the full amount back as credit, and the cancellation counts on your reliability record." : "Nobody has booked these dates yet, so nobody is affected."}
          </p>
          <div className="field">
            <label className="label" htmlFor={`run-reason-${runId}`}>
              Why it is cancelled
            </label>
            <input id={`run-reason-${runId}`} name="reason" className="input" maxLength={200} minLength={5} required />
          </div>
          <ErrorLine error={state.error} />
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn2" type="submit" name="step" value="cancel" disabled={pending}>
              {pending ? "Cancelling…" : "Cancel these dates"}
            </button>
            <button className="btn3" type="button" onClick={() => setCancelling(false)}>
              Keep them
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            {status === "draft" ? (
              <button className="btn" type="submit" name="step" value="open" disabled={pending}>
                Open for booking
              </button>
            ) : null}
            {status === "open" && seats > 0 ? (
              <button className="btn" type="submit" name="step" value="confirm" disabled={pending}>
                Confirm it will run
              </button>
            ) : null}
            {status === "draft" ? (
              <button className="btn3" type="submit" name="step" value="cancel" disabled={pending}>
                Remove these dates
              </button>
            ) : (
              <button className="btn3" type="button" onClick={() => setCancelling(true)}>
                Cancel these dates
              </button>
            )}
          </div>
          <ErrorLine error={state.error} />
        </>
      )}
    </form>
  );
}

export function RunLinkForm({ runId, link }: { runId: string; link: string }) {
  const [state, action, pending] = useActionState<RunState, FormData>(setRunLink, {});
  const [value, setValue] = useState(link); // stays in the box after saving
  return (
    <form action={action} className="flex flex-col gap-2.5">
      <input type="hidden" name="run_id" value={runId} />
      <label className="label" htmlFor={`run-link-${runId}`}>
        Meeting link for the group
      </label>
      <div className="flex flex-wrap items-center gap-2.5">
        <input id={`run-link-${runId}`} name="link" className="input mono min-w-[240px] flex-1 text-[15px]!" value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://meet.google.com/abc-defg-hij" />
        <button className="btn2 ink" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save link"}
        </button>
        {state.saved && !pending ? (
          <span className="flex items-center gap-1.5 text-[15px] text-forest-ink" role="status">
            <Check size={16} aria-hidden="true" />
            Saved
          </span>
        ) : null}
      </div>
      <p className="help">Google Meet or Zoom. Learners who have paid see it on their booking.</p>
      <ErrorLine error={state.error} />
    </form>
  );
}

const MARKS = [
  ["present", "Present"],
  ["late", "Late"],
  ["absent", "Absent"],
] as const;

/** Attendance and the lesson note for one session. Marking the last session finishes the group. */
export function MarkSessionForm({ runId, sessionId, seats, last }: { runId: string; sessionId: string; seats: { booking_id: string; name: string }[]; last: boolean }) {
  const [state, action, pending] = useActionState<RunState, FormData>(markRunSession, {});
  return (
    <form action={action} className="flex flex-col gap-4 rounded-[14px] bg-sand p-4">
      <input type="hidden" name="run_id" value={runId} />
      <input type="hidden" name="session_id" value={sessionId} />
      {seats.length ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="label mb-1">Who came</legend>
          {seats.map((s) => (
            <div key={s.booking_id} className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-card px-3 py-2">
              <span className="font-semibold">{s.name}</span>
              <span className="flex gap-1.5" role="radiogroup" aria-label={`Attendance for ${s.name}`}>
                {MARKS.map(([v, l], i) => (
                  <label key={v} className="chip sm cursor-pointer has-checked:border-ink has-checked:bg-ink has-checked:text-white">
                    <input type="radio" name={`att_${s.booking_id}`} value={v} defaultChecked={i === 0} className="sr-only" />
                    {l}
                  </label>
                ))}
              </span>
            </div>
          ))}
        </fieldset>
      ) : null}
      <div className="field">
        <label className="label" htmlFor={`covered-${sessionId}`}>
          What you covered
        </label>
        <textarea id={`covered-${sessionId}`} name="covered" className="input" minLength={10} maxLength={4000} required />
      </div>
      {last ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label className="label" htmlFor={`progress-${sessionId}`}>
              How the group did <span className="font-normal text-ink-2">(optional)</span>
            </label>
            <textarea id={`progress-${sessionId}`} name="progress" className="input min-h-[72px]!" maxLength={2000} />
          </div>
          <div className="field">
            <label className="label" htmlFor={`next-${sessionId}`}>
              What to do next <span className="font-normal text-ink-2">(optional)</span>
            </label>
            <textarea id={`next-${sessionId}`} name="next" className="input min-h-[72px]!" maxLength={2000} />
          </div>
        </div>
      ) : null}
      {last ? <p className="help">This is the last session. Saving sends the note to every learner; each seat is released to you when the learner confirms, or after 48 hours.</p> : null}
      <ErrorLine error={state.error} />
      <button className="btn self-start" type="submit" disabled={pending}>
        {pending ? "Saving…" : last ? "Save and finish the group" : "Save attendance and note"}
      </button>
    </form>
  );
}
