import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleCheck, Clock, CreditCard, ReceiptText, RotateCcw, Search, Wallet, X } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { StatCard } from "@/components/app/stat-card";
import { getTransactions, type Transaction } from "@/lib/data/learning";
import { getCredits } from "@/lib/data/lessons";
import { REFUND_STATUS_LABELS } from "@/domain/booking";
import { METHOD_LABELS, PAYMENT_LABELS, PAYMENT_TONE, paymentTab } from "@/domain/learning";
import { formatDate, formatKES, formatTime } from "@/domain/format";

export const metadata: Metadata = { title: "Payments & Transactions" };

const TABS = [
  ["all", "All transactions"],
  ["successful", "Successful"],
  ["pending", "Pending"],
  ["failed", "Failed"],
  ["refunded", "Refunded"],
] as const;
type Tab = (typeof TABS)[number][0];
const PERIODS = [
  ["3", "Last 3 months"],
  ["6", "Last 6 months"],
  ["12", "Last 12 months"],
  ["all", "All time"],
] as const;

/** Payments & Transactions: every payment the learner made, its state from the payment provider, refunds and receipts. */
export default function PaymentsPage(props: PageProps<"/payments">) {
  return (
    <Guarded next="/payments">
      <Payments searchParams={props.searchParams} />
    </Guarded>
  );
}

function Status({ status }: { status: string }) {
  return <span className={`pill ${PAYMENT_TONE[status] ?? "bg-sand"}`}>{PAYMENT_LABELS[status] ?? status}</span>;
}

const paidOn = (t: Transaction) => t.succeeded_at ?? t.created_at;
const hasReceipt = (t: Transaction) => ["succeeded", "refunded", "partially_refunded"].includes(t.status);

function DetailsPanel({ t, close }: { t: Transaction; close: string }) {
  return (
    <aside className="card flex flex-col gap-4 p-5 lg:sticky lg:top-[100px]" aria-labelledby="tx-h">
      <div className="flex items-start justify-between gap-3">
        <h2 id="tx-h" className="t3">
          Transaction details
        </h2>
        <Link className="iconbtn ghost -mt-2 -mr-2" href={close} aria-label="Close the details" scroll={false}>
          <X size={20} aria-hidden="true" />
        </Link>
      </div>
      <p className={`flex items-center gap-2 rounded-[12px] px-3 py-2 font-semibold ${PAYMENT_TONE[t.status] ?? "bg-sand"}`}>
        {t.status === "succeeded" ? <CircleCheck size={18} aria-hidden="true" /> : null}
        Payment {(PAYMENT_LABELS[t.status] ?? t.status).toLowerCase()}
      </p>
      <dl className="flex flex-col gap-3 text-[15px] leading-[22px]">
        <div>
          <dt className="text-[13.5px] text-ink-2">Transaction reference</dt>
          <dd className="mono">{t.platform_ref}</dd>
        </div>
        <div>
          <dt className="text-[13.5px] text-ink-2">Learning experience</dt>
          <dd>{t.title ?? "—"}</dd>
          {t.teacher_name ? <dd className="text-ink-2">with {t.teacher_name}</dd> : null}
        </div>
        <div>
          <dt className="text-[13.5px] text-ink-2">Payment date and time</dt>
          <dd className="mono">
            {formatDate(paidOn(t))}, {formatTime(paidOn(t))}
          </dd>
        </div>
        <div>
          <dt className="text-[13.5px] text-ink-2">{t.status === "failed" ? "Amount, not charged" : t.status === "pending" ? "Amount" : "Amount paid"}</dt>
          <dd className="mono">{formatKES(t.amount_kes)}</dd>
        </div>
        <div>
          <dt className="text-[13.5px] text-ink-2">Payment method</dt>
          <dd>{METHOD_LABELS[t.method] ?? t.method}</dd>
        </div>
        {t.status === "failed" ? (
          <div>
            <dt className="text-[13.5px] text-ink-2">What happened</dt>
            <dd>Nothing was charged and no booking was confirmed.</dd>
          </div>
        ) : null}
        {t.refunds.length ? (
          <div>
            <dt className="text-[13.5px] text-ink-2">Refunds for this payment</dt>
            {t.refunds.map((r) => (
              <dd key={r.id} className="flex flex-wrap justify-between gap-x-3">
                <span className="mono">{r.platform_ref}</span>
                <span>
                  <span className="mono">{formatKES(r.amount_kes)}</span> · {REFUND_STATUS_LABELS[r.status] ?? r.status}
                </span>
              </dd>
            ))}
          </div>
        ) : null}
      </dl>
      <div className="flex flex-col gap-2">
        {hasReceipt(t) ? (
          <Link className="btn2 w-full" href={`/payments/${t.id}`}>
            <ReceiptText size={18} aria-hidden="true" />
            View receipt
          </Link>
        ) : null}
        {t.booking_id ? (
          <Link className="btn3 self-start" href={t.status === "pending" ? `/checkout/${t.booking_id}/status` : `/bookings/${t.booking_id}`}>
            {t.status === "pending" ? "Check the payment" : "View the booking"} <ArrowRight size={16} aria-hidden="true" />
          </Link>
        ) : t.package_id ? (
          <Link className="btn3 self-start" href={`/packages/${t.package_id}`}>
            View the package <ArrowRight size={16} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </aside>
  );
}

async function Payments({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, all, credits] = await Promise.all([searchParams, getTransactions(), getCredits()]);
  const now = new Date().getTime();
  const tab: Tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as Tab) : "all";
  const period = PERIODS.some(([k]) => k === sp.period) ? (sp.period as (typeof PERIODS)[number][0]) : "3";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 40) : "";
  const needle = q.toLowerCase();
  const since = period === "all" ? 0 : now - Number(period) * 30.44 * 86_400_000;

  // Paying with credit moves money already counted, so it is not spent twice.
  const paidIn = all.filter((t) => hasReceipt(t) && t.method !== "credit").reduce((n, t) => n + t.amount_kes, 0);
  const pending = all.filter((t) => t.status === "pending").reduce((n, t) => n + t.amount_kes, 0);
  const refunded = all.reduce((n, t) => n + t.refunded_kes, 0);
  const onItsWay = credits.lines.reduce((n, l) => n + l.open_refund_kes, 0);

  const shown = all
    .filter((t) => tab === "all" || paymentTab(t.status) === tab)
    .filter((t) => new Date(t.created_at).getTime() >= since)
    .filter((t) => !needle || `${t.platform_ref} ${t.title ?? ""}`.toLowerCase().includes(needle));
  const open = typeof sp.tx === "string" ? all.find((t) => t.id === sp.tx) : undefined;

  const href = (o: { tab?: Tab; tx?: string | null }) => {
    const t = o.tab ?? tab;
    const x = o.tx === undefined ? open?.id : o.tx;
    const p = new URLSearchParams({ ...(t !== "all" ? { tab: t } : {}), ...(period !== "3" ? { period } : {}), ...(q ? { q } : {}), ...(x ? { tx: x } : {}) });
    return `/payments${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="flex max-w-[1180px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="t1">Payments &amp; Transactions</h1>
        <p className="text-ink-2">View your payment history, transactions and refunds.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={Wallet} value={formatKES(paidIn)} label="Total spent" sub="Paid by M-Pesa or card" />
        <StatCard icon={Clock} tone="sand" value={formatKES(pending)} label="Pending payments" sub="Waiting for confirmation" />
        <StatCard icon={RotateCcw} tone="forest" value={formatKES(refunded)} label="Total refunded" sub="Sent back to you" />
        <StatCard icon={CreditCard} tone="forest" value={formatKES(credits.balance - onItsWay)} label="Credit" sub="To spend on your next booking" href="/account/credits" />
      </div>

      <div className="flex flex-col gap-3">
        <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
          {TABS.map(([k, label]) => (
            <Link key={k} className={`chip sm${tab === k ? " on" : ""}`} href={href({ tab: k, tx: null })} aria-current={tab === k ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <form className="flex flex-wrap items-center gap-2" role="search">
          {tab !== "all" ? <input type="hidden" name="tab" value={tab} /> : null}
          <label className="sr-only" htmlFor="period">
            Period
          </label>
          <span className="sel">
            <select id="period" name="period" className="select h-[50px]!" defaultValue={period}>
              {PERIODS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </span>
          <div className="relative min-w-[200px] flex-1 sm:max-w-[340px]">
            <label className="sr-only" htmlFor="pq">
              Search by transaction reference
            </label>
            <Search size={18} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-2" />
            <input id="pq" name="q" className="input pl-10!" defaultValue={q} placeholder="Search by transaction reference" />
          </div>
          <button className="btn2 ink h-[50px]!" type="submit">
            Show
          </button>
        </form>
      </div>

      <div className={`grid items-start gap-5 ${open ? "lg:grid-cols-[minmax(0,1fr)_300px]" : ""}`}>
        <section className="flex min-w-0 flex-col gap-3" aria-label="Transactions">
          {shown.length ? (
            <>
              <div className="card hidden overflow-x-auto p-0! md:block">
                <table className="table-k min-w-[620px]">
                  <thead>
                    <tr>
                      <th scope="col">Reference</th>
                      <th scope="col">Learning experience</th>
                      <th scope="col">Date</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Method</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((t) => (
                      <tr key={t.id} className={open?.id === t.id ? "bg-orange-wash" : ""}>
                        <td className="mono text-[14px]">
                          <Link href={href({ tx: t.id })} scroll={false} aria-label={`Details of ${t.platform_ref}`}>
                            {t.platform_ref}
                          </Link>
                        </td>
                        <td>{t.title ?? "—"}</td>
                        <td className="mono text-[14px] whitespace-nowrap">
                          {formatDate(paidOn(t))}
                          <br />
                          {formatTime(paidOn(t))}
                        </td>
                        <td className="mono whitespace-nowrap">{formatKES(t.amount_kes)}</td>
                        <td>{METHOD_LABELS[t.method] ?? t.method}</td>
                        <td>
                          <Status status={t.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="flex flex-col gap-3 md:hidden">
                {shown.map((t) => (
                  <li key={t.id}>
                    <Link href={href({ tx: t.id })} className={`card flex flex-col gap-2 p-4 text-ink no-underline ${open?.id === t.id ? "bg-orange-wash!" : ""}`}>
                      <span className="flex items-start justify-between gap-3">
                        <span className="font-semibold">{t.title ?? "Payment"}</span>
                        <span className="mono flex-none">{formatKES(t.amount_kes)}</span>
                      </span>
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="mono text-[13.5px] text-ink-2">
                          {formatDate(paidOn(t))} · {METHOD_LABELS[t.method] ?? t.method}
                        </span>
                        <Status status={t.status} />
                      </span>
                      <span className="mono text-[13px] text-ink-2">{t.platform_ref}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="help">
                Showing <span className="mono">{shown.length}</span> of <span className="mono">{all.length}</span> {all.length === 1 ? "transaction" : "transactions"}.
              </p>
            </>
          ) : (
            <div className="empty">
              <ReceiptText size={24} aria-hidden="true" />
              <p className="font-semibold">{all.length ? "No transactions match." : "No payments yet."}</p>
              <p className="help">{all.length ? "Try another tab or a longer period." : "Every payment you make shows here with its receipt. A failed payment stays listed and charges nothing."}</p>
            </div>
          )}
        </section>
        {open ? <DetailsPanel t={open} close={href({ tx: null })} /> : null}
      </div>
    </div>
  );
}
