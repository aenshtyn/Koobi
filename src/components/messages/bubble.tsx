import { Check, CheckCheck, FileText } from "lucide-react";
import type { Message } from "@/lib/data/matching";
import { formatTime } from "@/domain/format";

/** One message: the text, a file if it has one, the time, and for your own messages whether it was read. */
export function Bubble({ m, mine, from, stamp }: { m: Message; mine: boolean; from: string; stamp?: string }) {
  const onlyFile = !!m.attachment_key && m.body === m.attachment_name;
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[82%] px-4 py-2.5 ${mine ? "rounded-[18px_18px_6px_18px] bg-ink text-white" : "rounded-[18px_18px_18px_6px] bg-sand"}`}>
        <span className="sr-only">{mine ? "You: " : `${from}: `}</span>
        {onlyFile ? null : <p className="break-words whitespace-pre-line">{m.body}</p>}
        {m.attachment_key ? (
          <a
            href={`/messages/file/${m.id}`}
            target="_blank"
            rel="noreferrer"
            className={`mt-1 flex items-center gap-2 rounded-[10px] px-2.5 py-2 text-[15px] no-underline ${mine ? "bg-white/15 text-white hover:bg-white/25" : "bg-card text-ink hover:bg-orange-wash"}`}
          >
            <FileText size={18} aria-hidden="true" className="flex-none" />
            <span className="min-w-0 truncate">{m.attachment_name ?? "File"}</span>
          </a>
        ) : null}
        <p className={`mono mt-1 flex items-center gap-1.5 text-[11px] ${mine ? "justify-end text-white/70" : "text-ink-2"}`}>
          <span>
            {stamp ? `${stamp} ` : ""}
            {formatTime(m.created_at)}
            {m.redacted ? " · contact details hidden" : ""}
          </span>
          {mine && m.read_at !== undefined ? (
            m.read_at ? (
              <span className="flex items-center gap-0.5 font-sans">
                <CheckCheck size={14} aria-hidden="true" /> Read
              </span>
            ) : (
              <span className="flex items-center gap-0.5 font-sans">
                <Check size={14} aria-hidden="true" /> Sent
              </span>
            )
          ) : null}
        </p>
      </div>
    </div>
  );
}
