import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORIES } from "@/domain/taxonomy";
import { PageIntro } from "@/components/site/sections";

export const metadata: Metadata = { title: "Founding members" };

export default function FoundingMembersPage() {
  return (
    <>
      <PageIntro
        title={
          <>
            Join <span className="swash">before</span> your category opens.
          </>
        }
        lead="We open one category at a time. Teachers and experts in the next ones can apply now, pass their checks early and go live the day their category opens."
      />
      <div className="page-wrap grid gap-6 pb-24 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card flex flex-col gap-4 p-7" aria-labelledby="fm-h">
          <h2 id="fm-h" className="mk md">
            What <span className="hl">founding members</span> get
          </h2>
          <ul className="flex flex-col gap-2.5">
            <li>Your checks done before the rush, so your offers are live on the first day.</li>
            <li>A founding member label on your profile.</li>
            <li>A say in how your category is described and priced.</li>
            <li>A monthly update on when your category opens.</li>
          </ul>
          <Link className="btn self-start" href="/teach/apply">
            Apply as a founding member
          </Link>
        </section>
        <aside className="card r3 flex flex-col gap-3 p-6" aria-label="Categories">
          <h2 className="h4">Categories</h2>
          <ul className="flex flex-col gap-2">
            {CATEGORIES.map((c) => (
              <li key={c.code}>
                <Link href={`/explore/${c.slug}`}>{c.label}</Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </>
  );
}
