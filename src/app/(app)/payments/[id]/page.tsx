import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleCheck } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { Logo } from "@/components/ui/trust";
import { getSessionUser } from "@/lib/auth";
import { getTransactions } from "@/lib/data/learning";
import { REFUND_STATUS_LABELS } from "@/domain/booking";
import { METHOD_LABELS, PAYMENT_LABELS } from "@/domain/learning";
import { formatDate, formatKES, formatTime } from "@/domain/format";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Receipt" };

/** The receipt for one successful payment. Printing it (or saving as PDF) leaves out the menus. */
export default function ReceiptPage(props: PageProps<"/payments/[id]">) {
  return (
    <Guarded next="/payments">
      <Receipt params={props.params} />
    </Guarded>
  );
}

async function Receipt({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, all, user] = await Promise.all([params, getTransactions(), getSessionUser()]);
  const t = all.find((x) => x.id === id);
  if (!t || !["succeeded", "refunded", "partially_refunded"].includes(t.status)) notFound();
  const when = t.succeeded_at ?? t.created_at;
  const rows: [string, React.ReactNode, boolean?][] = [
    ["Transaction reference", t.platform_ref, true],
    ["Paid by", user?.name ?? "—"],
    ...(t.learner_alias && t.learner_alias !== user?.name?.split(" ")[0] ? ([["Learner", t.learner_alias]] as [string, React.ReactNode][]) : []),
    ["Learning experience", t.title ?? "—"],
    ["Expert", t.teacher_name ?? "—"],
    ["Payment date", `${formatDate(when)} · ${formatTime(when)} EAT`, true],
    ["Payment method", METHOD_LABELS[t.method] ?? t.method],
    ["Amount paid", formatKES(t.amount_kes), true],
  ];
  return (
    <div className="flex max-w-[640px] flex-col gap-5">
      <Link className="btn3 no-print self-start" href={`/payments?tx=${t.id}`}>
        <ArrowLeft size={16} aria-hidden="true" />
        Back to Payments &amp; Transactions
      </Link>
      <h1 className="t1 no-print">Receipt</h1>
      <article className="card flex flex-col gap-5 p-6 sm:p-8" aria-label={`Receipt ${t.platform_ref}`}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b-[1.5px] border-ink pb-4">
          <Logo small />
          <div className="flex flex-col items-end">
            <span className="font-display text-[20px] font-bold tracking-[0.04em]">RECEIPT</span>
            <span className="mono text-[13.5px] text-ink-2">{t.platform_ref}</span>
          </div>
        </header>
        <dl className="flex flex-col">
          {rows.map(([k, v, mono]) => (
            <div key={k} className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-dashed border-line-2 py-2.5 text-[15px] leading-[22px]">
              <dt className="font-semibold">{k}</dt>
              <dd className={mono ? "mono text-right" : "text-right"}>{v}</dd>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-x-4 py-2.5 text-[15px] leading-[22px]">
            <dt className="font-semibold">Transaction status</dt>
            <dd>
              <span className="pill bg-forest-tint text-forest-ink">
                <CircleCheck size={15} aria-hidden="true" />
                {t.status === "succeeded" ? "Successful" : (PAYMENT_LABELS[t.status] ?? t.status)}
              </span>
            </dd>
          </div>
        </dl>
        {t.refunds.length ? (
          <div className="flex flex-col gap-1.5">
            <h2 className="label">Refunds for this payment</h2>
            <ul className="flex flex-col">
              {t.refunds.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-dashed border-line-2 py-2 text-[15px]">
                  <span>
                    <span className="mono">{r.platform_ref}</span> · {REFUND_STATUS_LABELS[r.status] ?? r.status}
                    {r.completed_at ? (
                      <>
                        {" "}
                        · <span className="mono">{formatDate(r.completed_at)}</span>
                      </>
                    ) : null}
                  </span>
                  <span className="mono">{formatKES(r.amount_kes)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="rounded-[14px] bg-orange-wash px-4 py-3 text-[15px] leading-[22px]">
          <span className="font-semibold">Thank you for choosing Koobi.</span> Your payment is held safely and released to the expert only after the lesson is confirmed.
        </p>
      </article>
      <div className="no-print flex flex-wrap gap-3">
        <PrintButton />
        {t.booking_id ? (
          <Link className="btn2 ink" href={`/bookings/${t.booking_id}`}>
            View the booking
          </Link>
        ) : null}
      </div>
    </div>
  );
}
