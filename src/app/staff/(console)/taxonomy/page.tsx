import type { Metadata } from "next";
import { Guarded } from "@/components/app/shell";
import { serverClient } from "@/lib/supabase/server";
import { saveCategory, toggleSubject } from "../admin-actions";

export const metadata: Metadata = { title: "Categories", robots: { index: false } };

/** S20: categories and subjects. Admin edits; every public page reads from here. */
export default function TaxonomyPage(props: PageProps<"/staff/taxonomy">) {
  return (
    <Guarded next="/staff/taxonomy" anyOf={["concierge", "admin"]}>
      <Taxonomy searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Taxonomy({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const db = await serverClient();
  const [cats, subjects] = await Promise.all([
    db.from("categories").select("code, label, description, sort_order").order("sort_order"),
    db.from("subjects").select("code, label, is_active").order("sort_order").order("label"),
  ]);
  return (
    <div className="flex max-w-[900px] flex-col gap-8">
      <h1 className="t1">Categories</h1>
      {typeof sp.done === "string" ? <p className="panel escrow" role="status">{sp.done}</p> : null}
      {typeof sp.error === "string" ? <p className="panel error" role="alert">{sp.error}</p> : null}
      <section className="flex flex-col gap-3" aria-labelledby="c-h">
        <h2 id="c-h" className="t3">The four public categories</h2>
        {((cats.data ?? []) as { code: string; label: string; description: string | null }[]).map((c) => (
          <form key={c.code} action={saveCategory} className="card flex flex-col gap-3 p-5">
            <input type="hidden" name="code" value={c.code} />
            <div className="field">
              <label className="label" htmlFor={`l-${c.code}`}>Name <span className="help mono">{c.code}</span></label>
              <input id={`l-${c.code}`} name="label" className="input" defaultValue={c.label} maxLength={80} required />
            </div>
            <div className="field">
              <label className="label" htmlFor={`d-${c.code}`}>Description</label>
              <textarea id={`d-${c.code}`} name="description" className="input min-h-16" defaultValue={c.description ?? ""} maxLength={300} />
            </div>
            <button className="btn2 self-start" type="submit">Save</button>
          </form>
        ))}
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="s-h">
        <h2 id="s-h" className="t3">Subjects</h2>
        <ul className="card grid gap-x-6 p-5 sm:grid-cols-2">
          {((subjects.data ?? []) as { code: string; label: string; is_active: boolean }[]).map((s) => (
            <li key={s.code} className="flex items-center justify-between gap-3 border-b border-dashed border-line-2 py-2">
              <span className={s.is_active ? "" : "text-ink-2 line-through"}>{s.label}</span>
              <form action={toggleSubject}>
                <input type="hidden" name="code" value={s.code} />
                <input type="hidden" name="active" value={String(!s.is_active)} />
                <button className="btn3" type="submit">{s.is_active ? "Hide" : "Show"}</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
