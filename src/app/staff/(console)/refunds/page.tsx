import type { Metadata } from "next";
import Link from "next/link";
import { Guarded } from "@/components/app/shell";
import { getSessionUser } from "@/lib/auth";
import { getRefunds } from "@/lib/data/staff-cases";
import { REFUND_STATUS_LABELS } from "@/domain/booking";
import { formatDate, formatKES } from "@/domain/format";
import { approveRefund, checkRefund, recordTransfer, retryRefund } from "./actions";

export const metadata: Metadata = { title: "Refunds", robots: { index: false } };

const VIEWS = { queue: "To approve", sent: "With the provider", done: "Done" } as const;

/** S14: pending and executed refunds (FR-PAY-6). */
export default function StaffRefundsPage(props: PageProps<"/staff/refunds">) {
  return (
    <Guarded next="/staff/refunds" anyOf={["concierge", "finance", "admin"]}>
      <Refunds searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Refunds({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, user] = await Promise.all([searchParams, getSessionUser()]);
  const view = (typeof sp.view === "string" && sp.view in VIEWS ? sp.view : "queue") as keyof typeof VIEWS;
  const rows = await getRefunds(view);
  const finance = !!user?.roles.some((r) => r === "finance" || r === "admin");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="t1">Refunds</h1>
      {typeof sp.done === "string" ? <p className="panel escrow" role="status">{sp.done}</p> : null}
      {typeof sp.error === "string" ? <p className="panel error" role="alert">{sp.error}</p> : null}
      <nav className="flex flex-wrap gap-2" aria-label="Filter">
        {Object.entries(VIEWS).map(([k, label]) => (
          <Link key={k} className={`chip sm${view === k ? " on" : ""}`} href={k === "queue" ? "/staff/refunds" : `/staff/refunds?view=${k}`}>
            {label}
          </Link>
        ))}
      </nav>
      {!finance ? <p className="help">Finance approves refunds. You can see the queue.</p> : null}
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="table-k min-w-[900px]">
            <thead>
              <tr>
                <th scope="col">Refund</th>
                <th scope="col">Lesson</th>
                <th scope="col">Amount</th>
                <th scope="col">How</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="mono">{r.platform_ref}</span>
                    <p className="help">
                      {formatDate(r.created_at)} · {r.reason}
                    </p>
                  </td>
                  <td>
                    {r.booking ? <span>{r.booking.offering?.title ?? "Lesson"}</span> : "—"}
                    {r.dispute_id ? (
                      <p className="help">
                        <Link href={`/staff/disputes/${r.dispute_id}`}>From a dispute</Link>
                      </p>
                    ) : null}
                  </td>
                  <td className="mono">{formatKES(r.amount_kes)}</td>
                  <td>
                    {r.method === "transfer" ? "M-Pesa transfer by hand" : "Back through the provider"}
                    <p className="help mono">{r.payment?.platform_ref}</p>
                  </td>
                  <td>
                    {REFUND_STATUS_LABELS[r.status] ?? r.status}
                    {r.provider_ref ? <p className="help mono">{r.provider_ref}</p> : null}
                  </td>
                  <td>
                    {finance && r.status === "requested" ? (
                      <form action={approveRefund}>
                        <input type="hidden" name="refund_id" value={r.id} />
                        <button className="btn2" type="submit">
                          {r.method === "transfer" ? "Approve" : "Approve and send"}
                        </button>
                      </form>
                    ) : null}
                    {finance && r.status === "approved" && r.method === "transfer" ? (
                      <form action={recordTransfer} className="flex items-center gap-2">
                        <input type="hidden" name="refund_id" value={r.id} />
                        <label className="sr-only" htmlFor={`code-${r.id}`}>
                          M-Pesa code
                        </label>
                        <input id={`code-${r.id}`} name="code" className="input mono w-36" placeholder="M-Pesa code" required />
                        <button className="btn2" type="submit">
                          Record
                        </button>
                      </form>
                    ) : null}
                    {finance && (r.status === "failed" || (r.status === "approved" && r.method !== "transfer")) ? (
                      <form action={retryRefund}>
                        <input type="hidden" name="refund_id" value={r.id} />
                        <button className="btn2" type="submit">
                          Send again
                        </button>
                      </form>
                    ) : null}
                    {finance && r.status === "pending" ? (
                      <form action={checkRefund}>
                        <input type="hidden" name="refund_id" value={r.id} />
                        <button className="btn3" type="submit">
                          Check with the provider
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">Nothing here.</p>
      )}
    </div>
  );
}
