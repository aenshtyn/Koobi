"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Send, Smile, X } from "lucide-react";
import { MESSAGE_MAX } from "@/domain/matching";
import { markThreadRead, sendMessage, touchPresence, type SendState } from "./actions";

const EMOJI = ["🙂", "😊", "😄", "😂", "🙏", "👍", "👏", "💪", "🎉", "⭐", "✅", "❤️", "🤝", "👋", "🤔", "😅", "📚", "✏️", "💡", "📅", "⏰", "📌", "🔥", "🚀"];

/**
 * The message box: text, an optional file, and a small set of emoji. Files are for pairs who have a
 * paid booking between them; before that the button explains why it is off.
 */
export function Composer({ threadId, base, canAttach = false }: { threadId: string; base: string; canAttach?: boolean }) {
  const [state, action, pending] = useActionState<SendState, FormData>(sendMessage, {});
  const text = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState("");
  const [emoji, setEmoji] = useState(false);

  // React clears the form after a send; clear the file label with it.
  const [sent, setSent] = useState(state);
  if (state !== sent) {
    setSent(state);
    if (!state.error) setFile("");
  }

  const insert = (ch: string) => {
    const el = text.current;
    if (!el) return;
    const at = el.selectionStart ?? el.value.length;
    el.value = (el.value.slice(0, at) + ch + el.value.slice(el.selectionEnd ?? at)).slice(0, MESSAGE_MAX);
    el.focus();
    el.setSelectionRange(at + ch.length, at + ch.length);
  };

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="thread_id" value={threadId} />
      <input type="hidden" name="base" value={base} />
      <input
        ref={picker}
        type="file"
        name="file"
        accept="image/jpeg,image/png,application/pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        disabled={!canAttach}
        onChange={(e) => setFile(e.target.files?.[0]?.name ?? "")}
      />
      {file ? (
        <p className="flex items-center gap-2 self-start rounded-full bg-sand py-1 pr-1.5 pl-3 text-[14px]">
          <Paperclip size={15} aria-hidden="true" />
          <span className="max-w-[240px] truncate">{file}</span>
          <button
            type="button"
            className="iconbtn ghost h-7! w-7!"
            aria-label="Remove the file"
            onClick={() => {
              if (picker.current) picker.current.value = "";
              setFile("");
            }}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </p>
      ) : null}
      {emoji ? (
        <div className="flex flex-wrap gap-1 rounded-[14px] border-[1.5px] border-line-2 bg-card p-2" role="group" aria-label="Emoji">
          {EMOJI.map((ch) => (
            <button key={ch} type="button" className="h-9 w-9 cursor-pointer rounded-[8px] border-0 bg-transparent text-[20px] leading-none hover:bg-orange-wash" onClick={() => insert(ch)} aria-label={`Add ${ch}`}>
              {ch}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <button
          type="button"
          className="iconbtn ghost h-[56px]! w-10! flex-none disabled:cursor-not-allowed disabled:opacity-45"
          aria-label={canAttach ? "Attach a file (JPG, PNG or PDF, up to 4 MB)" : "Files can be shared after the first paid booking between you"}
          title={canAttach ? "Attach a file: JPG, PNG or PDF, up to 4 MB" : "Files can be shared after the first paid booking between you"}
          disabled={!canAttach}
          onClick={() => picker.current?.click()}
        >
          <Paperclip size={20} aria-hidden="true" />
        </button>
        <textarea
          ref={text}
          name="body"
          aria-label="Message"
          className="input min-h-[56px]! flex-1"
          maxLength={MESSAGE_MAX}
          placeholder="Write a message"
          required={!file}
          onKeyDown={(e) => {
            // With a keyboard and mouse, Enter sends and Shift + Enter starts a new line. On a phone, Enter is a new line.
            if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
            if (!window.matchMedia("(pointer: fine)").matches) return;
            e.preventDefault();
            if (e.currentTarget.value.trim() || file) e.currentTarget.form?.requestSubmit();
          }}
        />
        <button type="button" className="iconbtn ghost h-[56px]! w-10! flex-none" aria-label={emoji ? "Hide emoji" : "Add an emoji"} aria-expanded={emoji} onClick={() => setEmoji((v) => !v)}>
          <Smile size={20} aria-hidden="true" />
        </button>
        <button className="btn h-[56px]! flex-none px-5!" type="submit" disabled={pending} aria-label="Send message">
          <Send size={20} aria-hidden="true" />
        </button>
      </div>
      <p className="help hidden text-[13.5px]! pointer-fine:block">Enter sends. Shift + Enter starts a new line.</p>
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

/** Marks the thread read once it is on screen, and looks for new messages every 15 seconds while it stays open. */
export function MarkRead({ threadId, count }: { threadId: string; count?: number }) {
  const router = useRouter();
  useEffect(() => {
    void markThreadRead(threadId);
  }, [threadId, count]);
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 15_000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}

/** A scrolling list of messages that opens at the newest one, and returns there when one is added. */
export function ScrollPane({ count, className, label, children }: { count: number; className?: string; label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);
  return (
    <div ref={ref} className={className} tabIndex={0} role="group" aria-label={label}>
      {children}
    </div>
  );
}

/** Tells Koobi the signed-in person is here, once a minute while the tab is in view. */
export function Presence() {
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState === "visible") void touchPresence();
    };
    ping();
    const t = setInterval(ping, 60_000);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", ping);
    };
  }, []);
  return null;
}
