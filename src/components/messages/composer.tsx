"use client";
import { useActionState, useEffect } from "react";
import { Send } from "lucide-react";
import { MESSAGE_MAX } from "@/domain/matching";
import { markThreadRead, sendMessage, type SendState } from "./actions";

export function Composer({ threadId, base }: { threadId: string; base: string }) {
  const [state, action, pending] = useActionState<SendState, FormData>(sendMessage, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="thread_id" value={threadId} />
      <input type="hidden" name="base" value={base} />
      <label className="sr-only" htmlFor="body">
        Message
      </label>
      <div className="flex items-end gap-2">
        <textarea id="body" name="body" className="input min-h-[56px]! flex-1" maxLength={MESSAGE_MAX} placeholder="Write a message" required />
        <button className="btn h-[56px]! px-5!" type="submit" disabled={pending} aria-label="Send message">
          <Send size={20} aria-hidden="true" />
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

/** Marks the thread read once it is on screen. */
export function MarkRead({ threadId }: { threadId: string }) {
  useEffect(() => {
    void markThreadRead(threadId);
  }, [threadId]);
  return null;
}
