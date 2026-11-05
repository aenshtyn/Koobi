import type { Metadata } from "next";
import Link from "next/link";
import { AREA_LABELS, PAGES, type Area } from "@/config/pages";
import { Logo } from "@/components/ui/trust";

export const metadata: Metadata = { title: "Page map", robots: { index: false } };

const AREAS: Area[] = ["public", "auth", "learner", "teacher", "staff", "system"];

function href(route: string | null) {
  if (!route) return null;
  return route
    .replace("[category]", "career")
    .replace("[slug]", "business-english-for-professionals")
    .replace(/\[[^\]]+\]/g, "example");
}

export default function PageMap() {
  const built = PAGES.filter((p) => p.built).length;
  return (
    <div className="app page-wrap flex flex-col gap-8 py-8">
      <Logo />
      <div className="flex flex-col gap-2">
        <h1 className="t1">Page map</h1>
        <p className="text-ink-2">
          <span className="mono">{PAGES.length}</span> screens, <span className="mono">{built}</span> built. Source:{" "}
          <span className="mono">src/config/pages.ts</span>. Planned routes open a placeholder that names the sprint.
        </p>
      </div>
      {AREAS.map((a) => {
        const list = PAGES.filter((p) => p.area === a);
        return (
          <section key={a} className="flex flex-col gap-3" aria-labelledby={`a-${a}`}>
            <h2 id={`a-${a}`} className="t2">
              {AREA_LABELS[a]} <span className="mono text-[16px] text-ink-2">{list.filter((p) => p.built).length}/{list.length}</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="table-k min-w-[720px]">
                <thead>
                  <tr>
                    <th scope="col">Screen</th>
                    <th scope="col">Group</th>
                    <th scope="col">Route</th>
                    <th scope="col">When</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => {
                    const h = href(p.route);
                    return (
                      <tr key={p.id}>
                        <td>
                          <span className="mono text-ink-2">{p.id}</span> {h ? <Link href={h}>{p.name}</Link> : p.name}
                        </td>
                        <td className="text-ink-2">{p.group}</td>
                        <td className="mono text-[13px]">{p.route ?? "component"}</td>
                        <td className="mono text-[13px]">{p.phase === "v1" ? "v1" : `Sprint ${p.sprint}`}</td>
                        <td>{p.built ? <span className="font-semibold text-forest">Built</span> : <span className="text-ink-2">Planned</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
