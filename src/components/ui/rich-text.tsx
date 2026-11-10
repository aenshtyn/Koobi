import { Fragment } from "react";

/**
 * Light formatting for longer text an expert writes (the "About" of a learning experience):
 * **bold**, *italic*, and lines that start with "- " or "1. " as lists. Nothing else is interpreted,
 * so no markup of the writer's can reach the page.
 */
type Block = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] };

export function parseRich(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d{1,2}[.)]\s+(.*)$/.exec(line);
    const last = blocks.at(-1);
    if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      const item = (bullet ?? numbered)![1];
      if (last && last.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
    } else if (!line.trim()) {
      if (last && last.kind === "p" && last.lines.length) blocks.push({ kind: "p", lines: [] });
    } else if (last && last.kind === "p") last.lines.push(line);
    else blocks.push({ kind: "p", lines: [line] });
  }
  return blocks.filter((b) => (b.kind === "p" ? b.lines.length : b.items.length));
}

function Inline({ text }: { text: string }) {
  // **bold** first, then *italic* inside what is left.
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (/^\*\*[^*\n]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
        return (
          <Fragment key={i}>
            {part.split(/(\*[^*\n]+\*)/g).map((p, j) => (/^\*[^*\n]+\*$/.test(p) ? <em key={j}>{p.slice(1, -1)}</em> : <Fragment key={j}>{p}</Fragment>))}
          </Fragment>
        );
      })}
    </>
  );
}

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {parseRich(text).map((b, i) =>
        b.kind === "p" ? (
          <p key={i}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j ? <br /> : null}
                <Inline text={l} />
              </Fragment>
            ))}
          </p>
        ) : b.kind === "ul" ? (
          <ul key={i} className="flex list-disc flex-col gap-1 pl-6">
            {b.items.map((it, j) => (
              <li key={j}>
                <Inline text={it} />
              </li>
            ))}
          </ul>
        ) : (
          <ol key={i} className="flex list-decimal flex-col gap-1 pl-6">
            {b.items.map((it, j) => (
              <li key={j}>
                <Inline text={it} />
              </li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
