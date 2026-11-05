import type { Metadata } from "next";
import Link from "next/link";
import { Guarded } from "@/components/app/shell";
import { getBatches } from "@/lib/data/staff-money";
import { BATCH_STATUS_LABELS } from "@/domain/payouts";
import { formatDate, formatKES } from "@/domain/format";
import { computeBatch } from "./actions";

export const metadata: Metadata = { title: "Payout batches", robots: { index: false } };

/** S13: computed weekly (Friday 06:00), two approvers (FR-PAYOUT-2). */
export default function PayoutsPage(props: PageProps<"/staff/payouts">) {
  return (
    <Guarded next="/staff/payouts" anyOf={["finance", "admin"]}>
      <Batches searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Batches({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, batches] = await Promise.all([searchParams, getBatches()]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="t1">Payout batches</h1>
        <form action={computeBatch}>
          <button className="btn2" type="submit">
            Build this week’s batch now
          </button>
        </form>
      </div>
      {typeof sp.error === "string" ? <p className="panel error">{sp.error}</p> : null}
      <p className="help">The batch builds itself every Friday at 06:00 from lessons released before then. Two different people approve before anything is sent.</p>
      {batches.length ? (
        <div className="overflow-x-auto">
          <table className="table-k min-w-[760px]">
            <thead>
              <tr>
                <th scope="col">Week</th>
                <th scope="col">Teachers</th>
                <th scope="col">Lessons</th>
                <th scope="col">Withholding</th>
                <th scope="col">Net to teachers</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link className="mono" href={`/staff/payouts/${b.id}`}>
                      {formatDate(b.week_start)}
                    </Link>
                  </td>
                  <td className="mono">{b.teacher_count}</td>
                  <td className="mono">{formatKES(b.gross_kes)}</td>
                  <td className="mono">{formatKES(b.withholding_kes)}</td>
                  <td className="mono font-semibold">{formatKES(b.net_kes)}</td>
                  <td>{BATCH_STATUS_LABELS[b.status] ?? b.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No batches yet.</p>
      )}
    </div>
  );
}
