"use client";
import { useState } from "react";
import { useEchoAction } from "@/lib/use-echo-action";
import { reviewChange, reviewVideo, type ReviewState } from "./actions";

export function VideoDecision({ id }: { id: string }) {
  const [state, action, pending] = useEchoAction<ReviewState>(reviewVideo, {});
  const [mode, setMode] = useState<"" | "changes" | "reject">("");
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="video_id" value={id} />
      {mode ? (
        <div className="field">
          <label className="label" htmlFor={`vnote-${id}`}>
            {mode === "changes" ? "What should change" : "Why it is rejected"}
          </label>
          <textarea id={`vnote-${id}`} name="note" className="input min-h-20" maxLength={500} defaultValue={state.values?.note} required />
          <p className="help">The expert sees this exactly as written.</p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {mode ? (
          <>
            <button className="btn2" type="submit" name="decision" value={mode} disabled={pending}>
              {mode === "changes" ? "Ask for changes" : "Reject the video"}
            </button>
            <button className="btn3" type="button" onClick={() => setMode("")}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="btn2" type="submit" name="decision" value="approve" disabled={pending}>
              {pending ? "Saving…" : "Approve video"}
            </button>
            <button className="btn3" type="button" onClick={() => setMode("changes")}>
              Ask for changes
            </button>
            <button className="btn3" type="button" onClick={() => setMode("reject")}>
              Reject
            </button>
          </>
        )}
      </div>
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function ChangeDecision({ id }: { id: string }) {
  const [state, action, pending] = useEchoAction<ReviewState>(reviewChange, {});
  const [refusing, setRefusing] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="change_id" value={id} />
      {refusing ? (
        <div className="field">
          <label className="label" htmlFor={`cnote-${id}`}>
            Why the changes are not approved
          </label>
          <textarea id={`cnote-${id}`} name="note" className="input min-h-20" maxLength={500} defaultValue={state.values?.note} required />
          <p className="help">The expert sees this exactly as written. Their live profile stays as it is.</p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {refusing ? (
          <>
            <button className="btn2" type="submit" name="decision" value="reject" disabled={pending}>
              Do not approve
            </button>
            <button className="btn3" type="button" onClick={() => setRefusing(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="btn2" type="submit" name="decision" value="approve" disabled={pending}>
              {pending ? "Saving…" : "Approve and make live"}
            </button>
            <button className="btn3" type="button" onClick={() => setRefusing(true)}>
              Do not approve
            </button>
          </>
        )}
      </div>
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
