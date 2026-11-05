import type { Metadata } from "next";
import { Guarded } from "@/components/app/shell";
import { getSessionUser } from "@/lib/auth";
import { getReconciliation } from "@/lib/data/staff-money";
import { formatDate, formatKES, formatTime } from "@/domain/format";
import { decideAdjustment, requestTopUp, runNow } from "./actions";

export const metadata: Metadata = { title: "Reconciliation", robots: { index: false } };

const CHECKS: Record<string, string> = {
  journal_balanced: "A journal does not balance",
  client_money_covered: "Money owed to clients, teachers and KRA is more than the cash at the provider",
  payment_has_one_hold: "A payment is not held exactly once",
  session_has_one_entitlement: "A confirmed lesson is not paid exactly once",
  payout_posted_once: "A sent payout is not posted exactly once",
  teacher_payable_not_negative: "A teacher balance is below zero",
};

/** S15: provider against ledger, daily at 02:00 (FR-LEDGER-6). A failed run pauses payouts. */
export default function ReconciliationPage(props: PageProps<"/staff/reconciliation">) {
  return (
    <Guarded next="/staff/reconciliation" anyOf={["finance", "admin"]}>
      <Recon searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Recon({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, { runs, adjustments }, user] = await Promise.all([searchParams, getReconciliation(), getSessionUser()]);
  const latest = runs[0];
  const waiting = adjustments.filter((a) => a.status === "requested");
  return (
    <div className="flex max-w-[900px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="t1">Reconciliation</h1>
        <form action={runNow}>
          <button className="btn2" type="submit">
            Run the checks now
          </button>
        </form>
      </div>
      {typeof sp.done === "string" ? <p className="panel escrow" role="status">{sp.done}</p> : null}
      {typeof sp.error === "string" ? <p className="panel error" role="alert">{sp.error}</p> : null}
      {latest ? (
        <section className={`panel ${latest.status === "passed" ? "escrow" : "error"} flex-col`} aria-label="Latest run">
          <b>
            {latest.status === "passed" ? "Passed" : "Failed: payouts are paused"} ·{" "}
            <span className="mono">
              {formatDate(latest.created_at)} {formatTime(latest.created_at)}
            </span>
          </b>
          {latest.findings.map((f, i) => (
            <span key={i}>
              {CHECKS[String(f.check)] ?? String(f.check)}
              {f.check === "client_money_covered" ? (
                <>
                  {" "}
                  (owed <span className="mono">{formatKES(Number(f.liabilities_kes))}</span>, cash <span className="mono">{formatKES(Number(f.cash_kes))}</span>,
                  short <span className="mono">{formatKES(Number(f.liabilities_kes) - Number(f.cash_kes))}</span>)
                </>
              ) : null}
            </span>
          ))}
        </section>
      ) : (
        <p className="empty">No runs yet. The checks run every night at 02:00.</p>
      )}
      <p className="help">
        These checks compare the ledger with itself. Comparing with the provider’s settlement reports is done by Finance from the Paystack dashboard until that
        report is connected.
      </p>

      <section className="flex flex-col gap-3" aria-labelledby="adj-h">
        <h2 id="adj-h" className="t3">
          Top up the provider balance
        </h2>
        <p className="help">
          Trial discounts and transfer fees are paid by Koobi. When they leave the provider balance short, Koobi adds money and records it here. One person
          requests, a different person approves.
        </p>
        <form action={requestTopUp} className="card flex flex-wrap items-end gap-3 p-5">
          <div className="field">
            <label className="label" htmlFor="amount_kes">
              Amount (KES)
            </label>
            <input id="amount_kes" name="amount_kes" className="input mono w-40" inputMode="numeric" pattern="[0-9]*" required />
          </div>
          <div className="field min-w-60 flex-1">
            <label className="label" htmlFor="reason">
              What it covers
            </label>
            <input id="reason" name="reason" className="input" required minLength={5} placeholder="Trial subsidies, week of …" />
          </div>
          <button className="btn2" type="submit">
            Request
          </button>
        </form>
        {waiting.length ? (
          <ul className="flex flex-col gap-2">
            {waiting.map((a) => (
              <li key={a.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <span>
                  <span className="mono">{formatKES(a.proposed_entries.filter((e) => e.side === "debit").reduce((s, e) => s + e.amount_kes, 0))}</span> · {a.reason}
                </span>
                {a.requested_by === user?.id ? (
                  <span className="help">Waiting for someone else</span>
                ) : (
                  <form action={decideAdjustment} className="flex gap-2">
                    <input type="hidden" name="request_id" value={a.id} />
                    <button className="btn2" type="submit" name="decision" value="approve">
                      Approve and post
                    </button>
                    <button className="btn3" type="submit" name="decision" value="reject">
                      Reject
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {runs.length > 1 ? (
        <section className="flex flex-col gap-2" aria-labelledby="hist-h">
          <h2 id="hist-h" className="t3">
            Earlier runs
          </h2>
          <ul className="flex flex-col">
            {runs.slice(1).map((r) => (
              <li key={r.id} className="flex justify-between gap-3 border-b border-dashed border-line-2 py-2">
                <span className="mono">
                  {formatDate(r.created_at)} {formatTime(r.created_at)}
                </span>
                <span>{r.status === "passed" ? "Passed" : `Failed · ${r.findings.length}`}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
