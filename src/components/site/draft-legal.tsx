import { brand } from "@/config/brand";
import { PageIntro } from "./sections";

/** Legal pages are outlines until a Kenyan lawyer drafts them (PLAN.md §2). Never presented as in force. */
export function DraftLegal({ title, sections }: { title: string; sections: [string, string][] }) {
  return (
    <>
      <PageIntro title={title}>
        <div className="panel info max-w-[680px]" role="note">
          <p>
            <b>Draft, not yet in force.</b> This page lists what the {title.toLowerCase()} will cover. The full text is being
            prepared with a Kenyan lawyer and will be published, with a version number and date, before {brand.name} takes payments.
          </p>
        </div>
      </PageIntro>
      <div className="page-wrap pb-24">
        <ol className="prose-k">
          {sections.map(([h, d]) => (
            <li key={h}>
              <span className="font-semibold">{h}.</span> {d}
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
