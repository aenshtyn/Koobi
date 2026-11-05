"use client";
import { useActionState, useState } from "react";
import type { Ranked } from "@/domain/matching";
import { formatKES } from "@/domain/format";
import { markUnmatched, sendShortlist, type ConsoleState } from "./actions";

export function ShortlistForm({ requestId, candidates, canAct }: { requestId: string; candidates: Ranked[]; canAct: boolean }) {
  const [state, action, pending] = useActionState<ConsoleState, FormData>(sendShortlist, {});
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 5 ? [...p, id] : p));
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="request_id" value={requestId} />
      <ol className="flex flex-col gap-3">
        {candidates.map((c) => {
          const on = picked.includes(c.offering_id);
          return (
            <li key={c.offering_id} className={`card flex flex-col gap-3 p-4 ${on ? "bg-orange-wash!" : ""} ${c.eligible ? "" : "opacity-80"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <label className="check items-start! gap-3!">
                  <input type="checkbox" name="pick" value={c.offering_id} checked={on} onChange={() => toggle(c.offering_id)} disabled={!canAct} className="mt-1" />
                  <span className="flex flex-col">
                    <span className="font-semibold">
                      {c.teacher_name} · {c.title}
                    </span>
                    <span className="help">{c.teacher_headline}</span>
                  </span>
                </label>
                <span className="mono text-sm">{formatKES(c.session_price_kes)} / session</span>
              </div>
              <ul className="flex flex-wrap gap-2 text-[13px]">
                <li className="pill">Tier {c.tier}</li>
                <li className="pill">{c.rating_avg !== null && c.review_count >= 3 ? `★ ${c.rating_avg.toFixed(1)} (${c.review_count})` : "No rating yet"}</li>
                {c.checks.map((k) => (
                  <li key={k.rule} className={`pill ${k.ok ? "bg-forest-tint text-forest-ink" : "bg-error-tint text-error"}`}>
                    {k.ok ? "✓" : "✗"} {k.rule}: {k.note}
                  </li>
                ))}
              </ul>
              {c.applied ? (
                <p className="panel info py-2!">
                  <b>Applied:</b>&nbsp;“{c.applied.pitch}”{c.applied.proposed_price_kes ? <> · <span className="mono">{formatKES(c.applied.proposed_price_kes)}</span>/h</> : null}
                </p>
              ) : null}
              {on ? (
                <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                  <div className="field">
                    <label className="label" htmlFor={`rank-${c.offering_id}`}>
                      Position
                    </label>
                    <span className="sel block">
                      <select id={`rank-${c.offering_id}`} name={`rank-${c.offering_id}`} className="select" defaultValue={String(picked.indexOf(c.offering_id) + 1)}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n}
                            {n <= 3 ? "" : " (reserve)"}
                          </option>
                        ))}
                      </select>
                    </span>
                  </div>
                  <div className="field">
                    <label className="label" htmlFor={`reason-${c.offering_id}`}>
                      Why this person (the learner sees this)
                    </label>
                    <input id={`reason-${c.offering_id}`} name={`reason-${c.offering_id}`} className="input" maxLength={200} required />
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {canAct ? (
        <div className="card flex flex-col gap-4 p-5">
          <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
            <div className="field">
              <label className="label" htmlFor="minutes">
                Minutes spent
              </label>
              <input id="minutes" name="minutes" type="number" min={1} max={1440} className="input mono" required />
            </div>
            <div className="field">
              <label className="label" htmlFor="note">
                Note for the team <span className="font-normal text-ink-2">(optional)</span>
              </label>
              <input id="note" name="note" className="input" maxLength={500} />
            </div>
          </div>
          {state.error ? (
            <p className="field-error" role="alert">
              {state.error}
            </p>
          ) : null}
          <button className="btn lg self-start" type="submit" disabled={pending || !picked.length}>
            {pending ? "Sending…" : `Send shortlist (${picked.length})`}
          </button>
        </div>
      ) : null}
    </form>
  );
}

export function UnmatchedForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState<ConsoleState, FormData>(markUnmatched, {});
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="btn3 self-start" onClick={() => setOpen(true)}>
        No one fits: close as unmatched
      </button>
    );
  return (
    <form action={action} className="card flex flex-col gap-3 p-5">
      <input type="hidden" name="request_id" value={requestId} />
      <div className="field">
        <label className="label" htmlFor="u-reason">
          Why no one fits
        </label>
        <textarea id="u-reason" name="reason" className="input" required placeholder="For example: no IGCSE Chemistry teachers in Mombasa yet." />
      </div>
      <div className="field max-w-[160px]">
        <label className="label" htmlFor="u-min">
          Minutes spent
        </label>
        <input id="u-min" name="minutes" type="number" min={1} className="input mono" required />
      </div>
      {state.error ? <p className="field-error" role="alert">{state.error}</p> : null}
      <div className="flex gap-3">
        <button className="btn2" type="submit" disabled={pending}>
          Close as unmatched
        </button>
        <button className="btn3" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
