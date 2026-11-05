import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { getEarnings } from "@/lib/data/earnings";
import { formatDate, formatKES } from "@/domain/format";
import { PAYOUT_STATUS_LABELS } from "@/domain/payouts";

export const metadata: Metadata = { title: "Statements" };

/** T23: weekly M-Pesa payouts with withholding shown (FR-PAYOUT-3). */
export default function StatementsPage() {
  return (
    <Guarded next="/teach/statements">
      <Statements />
    </Guarded>
  );
}

async function Statements() {
  const { payouts } = await getEarnings();
  const rows = payouts.filter((p) => p.status !== "excluded" && p.status !== "cancelled");
  return (
    <div className="flex max-w-[860px] flex-col gap-6">
      <h1 className="t1">Statements</h1>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="table-k min-w-[640px]">
            <thead>
              <tr>
                <th scope="col">Week</th>
                <th scope="col">Lessons</th>
                <th scope="col">Koobi fee</th>
                <th scope="col">Withholding tax</th>
                <th scope="col">Paid to you</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/teach/statements/${p.id}`} className="mono">
                      {p.batch ? formatDate(p.batch.week_start) : formatDate(p.created_at)}
                    </Link>
                  </td>
                  <td className="mono">{formatKES(p.gross_kes)}</td>
                  <td className="mono">{formatKES(p.platform_fee_kes)}</td>
                  <td className="mono">{formatKES(p.withholding_kes)}</td>
                  <td className="mono font-semibold">{formatKES(p.net_kes)}</td>
                  <td>{PAYOUT_STATUS_LABELS[p.status] ?? p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <FileText size={24} aria-hidden="true" />
          <p className="font-semibold">No statements yet.</p>
          <p className="help">Each weekly payout comes with a statement listing every lesson, the fee and the tax withheld.</p>
        </div>
      )}
    </div>
  );
}
