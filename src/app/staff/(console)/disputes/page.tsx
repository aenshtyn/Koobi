import type { Metadata } from "next";
import Link from "next/link";
import { Guarded } from "@/components/app/shell";
import { getDisputes } from "@/lib/data/staff-cases";
import { DISPUTE_OUTCOME_LABELS, DISPUTE_STATUS_LABELS, PROBLEM_TYPES } from "@/domain/booking";
import { humanMinutes } from "@/domain/matching";
import { formatDate, formatTime } from "@/domain/format";

export const metadata: Metadata = { title: "Disputes", robots: { index: false } };

/** S11: queue with timers (FR-DISP-2). Safety first, then by due time. */
export default function StaffDisputesPage(props: PageProps<"/staff/disputes">) {
  return (
    <Guarded next="/staff/disputes" anyOf={["concierge", "finance", "admin"]}>
      <Disputes searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Disputes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const view = sp.view === "decided" ? "decided" : "open";
  const rows = await getDisputes(view);
  const sorted = view === "open" ? [...rows].sort((a, b) => Number(b.type === "safety") - Number(a.type === "safety")) : rows;
  const now = new Date().getTime();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="t1">Disputes</h1>
      <nav className="flex flex-wrap gap-2" aria-label="Filter">
        <Link className={`chip sm${view === "open" ? " on" : ""}`} href="/staff/disputes">
          Open
        </Link>
        <Link className={`chip sm${view === "decided" ? " on" : ""}`} href="/staff/disputes?view=decided">
          Decided
        </Link>
      </nav>
      {sorted.length ? (
        <div className="overflow-x-auto">
          <table className="table-k min-w-[860px]">
            <thead>
              <tr>
                <th scope="col">Problem</th>
                <th scope="col">Lesson</th>
                <th scope="col">Teacher</th>
                <th scope="col">Status</th>
                <th scope="col">{view === "open" ? "Due" : "Outcome"}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((d) => {
                const mins = Math.round((new Date(d.sla_due_at).getTime() - now) / 60_000);
                return (
                  <tr key={d.id}>
                    <td>
                      <Link className="font-semibold" href={`/staff/disputes/${d.id}`}>
                        {PROBLEM_TYPES[d.type] ?? d.type}
                      </Link>
                      <p className="help">
                        From the {d.opened_by_role} · <span className="mono">{formatDate(d.created_at)}</span>
                      </p>
                    </td>
                    <td>
                      {d.booking?.offering?.title ?? "—"}
                      <p className="help">
                        {d.booking?.learner?.alias ?? "—"} · <span className="mono">{d.booking ? `${formatDate(d.booking.starts_at)} ${formatTime(d.booking.starts_at)}` : ""}</span>
                      </p>
                    </td>
                    <td>{d.booking?.teacher?.display_name ?? "—"}</td>
                    <td>{DISPUTE_STATUS_LABELS[d.status] ?? d.status}</td>
                    <td>
                      {view === "open" ? (
                        <span className={mins < 0 ? "pill bg-error-tint text-error" : mins < 12 * 60 ? "pill bg-orange-wash text-orange-ink" : "pill bg-sand text-ink-2"}>
                          {mins < 0 ? `overdue ${humanMinutes(-mins)}` : `in ${humanMinutes(mins)}`}
                        </span>
                      ) : (
                        <span className="help">{d.outcome ? DISPUTE_OUTCOME_LABELS[d.outcome] : "—"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">{view === "open" ? "No open disputes." : "No decided disputes yet."}</p>
      )}
    </div>
  );
}
