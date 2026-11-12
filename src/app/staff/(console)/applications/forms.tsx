"use client";
import { useState } from "react";
import { useEchoAction } from "@/lib/use-echo-action";
import { decideApplication, inviteMeeting, recordMeeting, reviewDocument, type StaffState } from "./actions";

function Problem({ state }: { state: StaffState }) {
  return state.error ? (
    <p className="field-error" role="alert">
      {state.error}
    </p>
  ) : null;
}

/** Verify or refuse one document. Refusing asks for the reason the expert will read. */
export function DocumentDecision({ id, back }: { id: string; back: string }) {
  const [state, action, pending] = useEchoAction<StaffState>(reviewDocument, {});
  const [refusing, setRefusing] = useState(false);
  return (
    <form action={action} className="flex w-full flex-col gap-2">
      <input type="hidden" name="credential_id" value={id} />
      <input type="hidden" name="back" value={back} />
      {refusing ? (
        <div className="field">
          <label className="label" htmlFor={`note-${id}`}>
            Why it cannot be verified
          </label>
          <textarea id={`note-${id}`} name="note" className="input min-h-16" maxLength={500} defaultValue={state.values?.note} required />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {refusing ? (
          <>
            <button className="btn2" type="submit" name="decision" value="reject" disabled={pending}>
              Not verified
            </button>
            <button className="btn3" type="button" onClick={() => setRefusing(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="btn2" type="submit" name="decision" value="approve" disabled={pending}>
              {pending ? "Saving…" : "Verified"}
            </button>
            <button className="btn3" type="button" onClick={() => setRefusing(true)}>
              Cannot verify
            </button>
          </>
        )}
      </div>
      <Problem state={state} />
    </form>
  );
}

export function InviteForm({ teacherId, again }: { teacherId: string; again: boolean }) {
  const [state, action, pending] = useEchoAction<StaffState>(inviteMeeting, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="teacher_id" value={teacherId} />
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_2fr]">
        <div className="field">
          <label className="label" htmlFor="date">
            Date
          </label>
          <input id="date" name="date" type="date" className="input mono" defaultValue={state.values?.date} required />
        </div>
        <div className="field">
          <label className="label" htmlFor="time">
            Time (Nairobi)
          </label>
          <input id="time" name="time" type="time" className="input mono" defaultValue={state.values?.time} required />
        </div>
        <div className="field">
          <label className="label" htmlFor="link">
            Meeting link
          </label>
          <input id="link" name="link" type="url" className="input" placeholder="https://meet.google.com/…" defaultValue={state.values?.link} required />
        </div>
      </div>
      <p className="help">The expert gets an email invitation to a 15-minute online meeting with this time and link, and sees it on their application page.</p>
      <Problem state={state} />
      <button className="btn2 self-start" type="submit" disabled={pending}>
        {pending ? "Sending…" : again ? "Send a new invitation" : "Send the invitation"}
      </button>
    </form>
  );
}

export function MeetingForm({ teacherId }: { teacherId: string }) {
  const [state, action, pending] = useEchoAction<StaffState>(recordMeeting, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="teacher_id" value={teacherId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-1">Outcome</legend>
        <div className="flex flex-wrap gap-2.5">
          {[
            ["suitable", "Suitable"],
            ["unsure", "Not sure yet"],
            ["not_suitable", "Not suitable"],
          ].map(([v, l]) => (
            <label key={v} className="option">
              <input type="radio" name="outcome" value={v} defaultChecked={state.values?.outcome === v} required />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label className="label" htmlFor="notes">
          What you observed
        </label>
        <textarea id="notes" name="notes" className="input min-h-28" maxLength={4000} defaultValue={state.values?.notes} placeholder="Experience, areas of expertise, communication, suitability for Koobi." required />
        <p className="help">Staff only. The expert never sees these notes.</p>
      </div>
      <Problem state={state} />
      <button className="btn2 self-start" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Record the outcome"}
      </button>
    </form>
  );
}

export function DecisionForm({ teacherId, canApprove, blockers, reopenOnly }: { teacherId: string; canApprove: boolean; blockers: string[]; reopenOnly?: boolean }) {
  const [state, action, pending] = useEchoAction<StaffState>(decideApplication, {});
  const [choice, setChoice] = useState<string>(reopenOnly ? "more_info" : "");
  const options: [string, string][] = reopenOnly
    ? [["more_info", "Reopen and return for more information"]]
    : [
        ["approve", "Approve"],
        ["more_info", "Return for more information"],
        ["reject", "Reject"],
      ];
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="teacher_id" value={teacherId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-1">Decision</legend>
        <div className="flex flex-wrap gap-2.5">
          {options.map(([v, l]) => (
            <label key={v} className={`option ${v === "approve" && !canApprove ? "opacity-50" : ""}`}>
              <input type="radio" name="decision" value={v} checked={choice === v} onChange={() => setChoice(v)} disabled={v === "approve" && !canApprove} required />
              {l}
            </label>
          ))}
        </div>
        {!canApprove && !reopenOnly && blockers.length ? <p className="help">Before approving: {blockers.join("; ")}.</p> : null}
      </fieldset>
      {choice && choice !== "approve" ? (
        <div className="field">
          <label className="label" htmlFor="note">
            {choice === "reject" ? "Reason" : "What the expert should add or clarify"}
          </label>
          <textarea id="note" name="note" className="input min-h-24" maxLength={1000} defaultValue={state.values?.note} required />
          <p className="help">The expert reads this exactly as written, in the email and on their application page.</p>
        </div>
      ) : null}
      {choice === "approve" ? <p className="help">The expert gets the confirmation email and the dashboard opens. Nothing becomes public: the profile and each learning experience have their own approvals.</p> : null}
      <Problem state={state} />
      <button className="btn self-start" type="submit" disabled={pending || !choice}>
        {pending ? "Saving…" : choice === "approve" ? "Approve the application" : choice === "reject" ? "Reject the application" : choice === "more_info" ? "Return to the expert" : "Record the decision"}
      </button>
    </form>
  );
}
