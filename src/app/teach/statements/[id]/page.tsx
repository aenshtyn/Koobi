import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Guarded } from "@/components/app/shell";
import { getStatement } from "@/lib/data/earnings";
import { KIND_LABELS } from "@/domain/booking";
import { formatDate, formatKES, formatTime } from "@/domain/format";
import { PAYOUT_STATUS_LABELS } from "@/domain/payouts";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Statement" };

/** T23: one payout's statement, printable (FR-PAYOUT-3). */
export default function StatementPage(props: PageProps<"/teach/statements/[id]">) {
  return (
    <Guarded next="/teach/statements">
      <Statement params={props.params} />
    </Guarded>
  );
}

async function Statement({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getStatement(id);
  if (!s) notFound();
  const { payout: p, lines, teacher } = s;
  return (
    <div className="flex max-w-[860px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link className="btn3" href="/teach/statements">
          All statements
        </Link>
        <PrintButton />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="t1">Payout statement</h1>
        <p className="text-ink-2">
          {teacher?.display_name} · week of <span className="mono">{p.batch ? formatDate(p.batch.week_start) : formatDate(p.created_at)}</span> ·{" "}
          {PAYOUT_STATUS_LABELS[p.status] ?? p.status}
          {p.sent_at ? (
            <>
              {" "}
              <span className="mono">
                {formatDate(p.sent_at)} {formatTime(p.sent_at)}
              </span>
            </>
          ) : null}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="table-k min-w-[720px]">
          <thead>
            <tr>
              <th scope="col">Lesson</th>
              <th scope="col">Price</th>
              <th scope="col">Koobi fee</th>
              <th scope="col">Withholding 5%</th>
              <th scope="col">To you</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.booking?.offering?.title ?? "Lesson"}
                  <p className="help">
                    {l.booking ? KIND_LABELS[l.booking.kind] : ""} · <span className="mono">{l.booking ? formatDate(l.booking.starts_at) : ""}</span>
                  </p>
                </td>
                <td className="mono">{formatKES(l.gross_kes)}</td>
                <td className="mono">
                  {formatKES(l.commission_kes)} <span className="help">({Math.round(Number(l.commission_rate) * 100)}%)</span>
                </td>
                <td className="mono">{formatKES(l.withholding_kes)}</td>
                <td className="mono">{formatKES(l.net_kes)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className="mono">{formatKES(p.gross_kes)}</td>
              <td className="mono">{formatKES(p.platform_fee_kes)}</td>
              <td className="mono">{formatKES(p.withholding_kes)}</td>
              <td className="mono font-semibold">{formatKES(p.net_kes)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="help">
        Trial lessons are paid at your full price with no fee; Koobi covers the learner’s discount. The M-Pesa transfer fee is paid by Koobi. Withholding tax is
        filed with KRA against your PIN.
      </p>
    </div>
  );
}
