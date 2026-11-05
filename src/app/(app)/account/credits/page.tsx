import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { getCredits } from "@/lib/data/lessons";
import { REFUND_STATUS_LABELS } from "@/domain/booking";
import { formatDate, formatKES } from "@/domain/format";
import { CreditRefundForm } from "../../bookings/forms";

export const metadata: Metadata = { title: "Credits" };

/** L25: credit from cancellations (FR-PAY-6). Spend it at checkout or ask for it back to M-Pesa. */
export default function CreditsPage(props: PageProps<"/account/credits">) {
  return (
    <Guarded next="/account/credits">
      <Credits searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Credits({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, { balance, lines }] = await Promise.all([searchParams, getCredits()]);
  const onItsWay = lines.reduce((s, l) => s + l.open_refund_kes, 0);
  return (
    <div className="flex max-w-[680px] flex-col gap-6">
      <h1 className="t1">Credits</h1>
      {sp.done === "requested" ? (
        <p className="panel escrow" role="status">
          Requested. Finance sends it back to the number that paid; this page shows when it is done.
        </p>
      ) : null}
      <div className="stat">
        <span className="help">Available to spend</span>
        <span className="v">{formatKES(balance - onItsWay)}</span>
        {onItsWay > 0 ? (
          <span className="help">
            <span className="mono">{formatKES(onItsWay)}</span> on its way back to M-Pesa
          </span>
        ) : null}
      </div>
      <p className="help">Credit pays for your next lesson at checkout.</p>
      {lines.length ? (
        <ul className="card flex flex-col divide-y divide-dashed divide-line-2 p-0!">
          {lines.map((l) => {
            const left = l.credit_kes - l.open_refund_kes;
            return (
              <li key={l.payment_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <span className="flex min-w-0 flex-col">
                  {l.booking_id ? (
                    <Link href={`/bookings/${l.booking_id}`} className="font-semibold">
                      {l.title ?? "Lesson"}
                    </Link>
                  ) : (
                    <span className="font-semibold">{l.title ?? "Payment"}</span>
                  )}
                  <span className="help">
                    <span className="mono">{l.platform_ref}</span>
                    {l.updated_at ? <> · {formatDate(l.updated_at)}</> : null}
                    {l.last_refund_status ? <> · {REFUND_STATUS_LABELS[l.last_refund_status] ?? l.last_refund_status}</> : null}
                    {l.refunded_kes > 0 ? (
                      <>
                        {" "}
                        · <span className="mono">{formatKES(l.refunded_kes)}</span> refunded
                      </>
                    ) : null}
                    {left === 0 && l.refunded_kes === 0 && l.open_refund_kes === 0 ? <> · used</> : null}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-2">
                  <span className="mono">{formatKES(left)}</span>
                  {left > 0 ? <CreditRefundForm paymentId={l.payment_id} label="Send back to M-Pesa" /> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="empty">
          <Wallet size={24} aria-hidden="true" />
          <p className="font-semibold">No credit yet.</p>
          <p className="help">If a lesson is cancelled in time, the money comes back here.</p>
        </div>
      )}
    </div>
  );
}
