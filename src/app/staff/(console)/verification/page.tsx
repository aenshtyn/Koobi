import type { Metadata } from "next";
import Link from "next/link";
import { Guarded } from "@/components/app/shell";
import { getReviewQueue } from "@/lib/data/verification";
import { CHECK_STATUS_LABELS } from "@/domain/payouts";
import { humanMinutes } from "@/domain/matching";
import { formatDate } from "@/domain/format";

export const metadata: Metadata = { title: "Verification", robots: { index: false } };

/** S3: checks waiting for a reviewer, oldest first. */
export default function StaffVerificationPage(props: PageProps<"/staff/verification">) {
  return (
    <Guarded next="/staff/verification" anyOf={["reviewer", "admin"]}>
      <Queue searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Queue({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const view = sp.view === "decided" ? "decided" : "waiting";
  const rows = await getReviewQueue(view);
  const now = new Date().getTime();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="t1">Verification</h1>
      {sp.done ? (
        <p className="panel escrow" role="status">
          {sp.done === "passed" ? "Passed. The badge and tier are updated." : "Recorded as not passed. The teacher sees your note."}
        </p>
      ) : null}
      <nav className="flex flex-wrap gap-2" aria-label="Filter">
        <Link className={`chip sm${view === "waiting" ? " on" : ""}`} href="/staff/verification">
          Waiting
        </Link>
        <Link className={`chip sm${view === "decided" ? " on" : ""}`} href="/staff/verification?view=decided">
          Decided
        </Link>
      </nav>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="table-k min-w-[760px]">
            <thead>
              <tr>
                <th scope="col">Check</th>
                <th scope="col">Teacher</th>
                <th scope="col">Level</th>
                <th scope="col">{view === "waiting" ? "Waiting" : "Result"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link className="font-semibold" href={`/staff/verification/${r.id}`}>
                      {r.check?.label ?? r.check_type}
                    </Link>
                    <p className="help">Attempt {r.attempt_no}</p>
                  </td>
                  <td>{r.teacher?.display_name ?? "—"}</td>
                  <td className="mono">{r.tier}</td>
                  <td>
                    {view === "waiting" ? (
                      <span className="mono">{humanMinutes(Math.max(0, Math.round((now - new Date(r.updated_at).getTime()) / 60_000)))}</span>
                    ) : (
                      <span>
                        {CHECK_STATUS_LABELS[r.status]} · <span className="mono">{formatDate(r.updated_at)}</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">{view === "waiting" ? "Nothing waiting for review." : "No decisions yet."}</p>
      )}
    </div>
  );
}
