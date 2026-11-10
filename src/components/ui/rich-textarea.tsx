"use client";
import { useRef } from "react";
import { Bold, Italic, List, ListOrdered } from "lucide-react";

type Edit = (value: string, start: number, end: number) => { value: string; start: number; end: number };
const wrap =
  (mark: string, sample: string): Edit =>
  (v, s, e) => {
    const picked = v.slice(s, e) || sample;
    return { value: v.slice(0, s) + mark + picked + mark + v.slice(e), start: s + mark.length, end: s + mark.length + picked.length };
  };
const prefix =
  (make: (i: number) => string): Edit =>
  (v, s, e) => {
    const from = v.lastIndexOf("\n", s - 1) + 1;
    const to = v.indexOf("\n", e) === -1 ? v.length : v.indexOf("\n", e);
    const out = v
      .slice(from, to)
      .split("\n")
      .map((l, i) => make(i) + l.replace(/^\s*(?:[-*•]|\d{1,2}[.)])\s+/, ""))
      .join("\n");
    return { value: v.slice(0, from) + out + v.slice(to), start: from, end: from + out.length };
  };
const EDITS = { bold: wrap("**", "bold text"), italic: wrap("*", "italic text"), bullets: prefix(() => "- "), numbers: prefix((i) => `${i + 1}. `) } satisfies Record<string, Edit>;
type ToolId = keyof typeof EDITS;
const TOOLS: { id: ToolId; label: string; Icon: typeof Bold }[] = [
  { id: "bold", label: "Bold", Icon: Bold },
  { id: "italic", label: "Italic", Icon: Italic },
  { id: "bullets", label: "Bulleted list", Icon: List },
  { id: "numbers", label: "Numbered list", Icon: ListOrdered },
];

/**
 * A textarea with four formatting buttons. It writes plain marks into the text (**bold**, *italic*,
 * "- " and "1. " lines), which RichText turns into formatting where the text is shown.
 */
export function RichTextarea(props: { id: string; name: string; defaultValue?: string; maxLength?: number; placeholder?: string; className?: string; "aria-describedby"?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const run = (id: ToolId) => {
    const el = ref.current;
    if (!el) return;
    const next = EDITS[id](el.value, el.selectionStart, el.selectionEnd);
    // The native setter, so the form's own change handling sees the edit.
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(el, next.value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
    el.setSelectionRange(next.start, next.end);
  };
  return (
    <div className="flex flex-col rounded-[var(--r-input)] border-[1.8px] border-ink bg-card focus-within:border-orange focus-within:shadow-[var(--focus)]">
      <div className="flex items-center gap-1 border-b border-dashed border-line-2 px-2 py-1.5" role="toolbar" aria-label="Formatting">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" className="iconbtn ghost h-9! w-9!" onClick={() => run(t.id)} aria-label={t.label} title={t.label}>
            <t.Icon size={18} aria-hidden="true" />
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        id={props.id}
        name={props.name}
        defaultValue={props.defaultValue}
        maxLength={props.maxLength}
        placeholder={props.placeholder}
        aria-describedby={props["aria-describedby"]}
        className={`min-h-[160px] w-full resize-y rounded-b-[var(--r-input)] border-0 bg-transparent px-3.5 py-3 text-[17px] leading-6 text-ink outline-none ${props.className ?? ""}`}
      />
    </div>
  );
}
