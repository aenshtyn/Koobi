"use client";
import { useActionState, useState } from "react";
import { acceptMatch, declineShortlist, type ShortlistState } from "./actions";

export function AcceptButton({ matchId, name }: { matchId: string; name: string }) {
  const [state, action, pending] = useActionState<ShortlistState, FormData>(acceptMatch, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="match_id" value={matchId} />
      <button className="btn2 block" type="submit" disabled={pending}>
        {pending ? "Choosing…" : `Choose ${name.split(" ")[0]}`}
      </button>
      {state.error ? <p className="field-error" role="alert">{state.error}</p> : null}
    </form>
  );
}

export function DeclineForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState<ShortlistState, FormData>(declineShortlist, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="btn3 self-start" type="button" onClick={() => setOpen(true)}>
        None of these fit: ask for more
      </button>
    );
  }
  return (
    <form action={action} className="card flex flex-col gap-3 p-5">
      <input type="hidden" name="request_id" value={requestId} />
      <div className="field">
        <label className="label" htmlFor="reason">
          What should be different?
        </label>
        <textarea id="reason" name="reason" className="input" maxLength={500} placeholder="For example: I need weekend times, or someone with banking experience." required />
      </div>
      {state.error ? <p className="field-error" role="alert">{state.error}</p> : null}
      <div className="flex flex-wrap gap-3">
        <button className="btn2" type="submit" disabled={pending}>
          {pending ? "Sending…" : "Ask for more options"}
        </button>
        <button className="btn3" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
