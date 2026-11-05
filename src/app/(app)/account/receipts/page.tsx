import type { Metadata } from "next";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { getMyPayments } from "@/lib/data/bookings";
import { formatDate, formatKES } from "@/domain/format";

export const metadata: Metadata = { title: "Receipts" };

const LABEL: Record<string, string> = { succeeded: "Paid", failed: "Failed, nothing charged", refunded: "Refunded", partially_refunded: "Part refunded" };

export default function ReceiptsPage() {
  return (
    <Guarded next="/account/receipts">
      <Receipts />
    </Guarded>
  );
}

async function Receipts() {
  const payments = await getMyPayments();
  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <h1 className="t1">Receipts</h1>
      {payments.length ? (
        <div className="overflow-x-auto">
          <table className="table-k min-w-[560px]">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Reference</th>
                <th scope="col">Method</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{formatDate(p.succeeded_at ?? p.created_at)}</td>
                  <td className="mono">{p.booking_id ? <Link href={`/bookings/${p.booking_id}`}>{p.platform_ref}</Link> : p.platform_ref}</td>
                  <td>{p.method === "card" ? "Card" : "M-Pesa"}</td>
                  <td className="mono">{formatKES(p.amount_kes)}</td>
                  <td>{LABEL[p.status] ?? p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <Receipt size={24} aria-hidden="true" />
          <p className="font-semibold">No payments yet.</p>
        </div>
      )}
    </div>
  );
}
