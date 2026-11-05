import type { Metadata } from "next";
import { Guarded } from "@/components/app/shell";
import { getLedger } from "@/lib/data/staff-money";
import { formatDate, formatKES, formatTime } from "@/domain/format";

export const metadata: Metadata = { title: "Ledger", robots: { index: false } };

const NAMES: Record<string, string> = {
  cash_provider: "Cash at Paystack",
  client_funds_held: "Learner money held",
  guardian_credits: "Learner credits",
  teacher_payable: "Owed to teachers",
  withholding_payable: "Withholding owed to KRA",
  vat_payable: "VAT owed",
  revenue_commission: "Fee income",
  expense_payment_fees: "Collection fees",
  expense_payout_fees: "Payout fees",
  expense_trial_subsidy: "Trial subsidy",
  expense_verification: "Verification costs",
  refunds_out: "Refunds",
};

export default function LedgerPage() {
  return (
    <Guarded next="/staff/ledger" anyOf={["finance", "admin"]}>
      <Ledger />
    </Guarded>
  );
}

async function Ledger() {
  const { balances, journals } = await getLedger();
  const total = balances.reduce((s, b) => s + b.balance, 0);
  const held = ["client_funds_held", "guardian_credits", "teacher_payable", "withholding_payable", "vat_payable"]
    .map((a) => -(balances.find((b) => b.account === a)?.balance ?? 0))
    .reduce((s, x) => s + x, 0);
  const cash = balances.find((b) => b.account === "cash_provider")?.balance ?? 0;
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-1">
        <h1 className="t1">Ledger</h1>
        <p className="text-ink-2">Double-entry, append-only, whole shillings. Debits are positive here.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="stat">
          <span className="help">Debits minus credits</span>
          <span className={`v ${total === 0 ? "text-forest" : "text-error"}`}>{formatKES(total)}</span>
          <span className="help">{total === 0 ? "Balanced" : "Out of balance: check now"}</span>
        </div>
        <div className="stat">
          <span className="help">Cash at the provider</span>
          <span className="v">{formatKES(cash)}</span>
        </div>
        <div className="stat">
          <span className="help">Owed to learners, teachers and KRA</span>
          <span className={`v ${held <= cash ? "" : "text-error"}`}>{formatKES(held)}</span>
          <span className="help">{held <= cash ? "Covered by cash" : "More owed than held: stop payouts"}</span>
        </div>
      </div>
      <section className="flex flex-col gap-3" aria-labelledby="b-h">
        <h2 id="b-h" className="t3">Balances</h2>
        <table className="table-k max-w-[620px]">
          <tbody>
            {balances.map((b) => (
              <tr key={b.account}>
                <td>{NAMES[b.account] ?? b.account}</td>
                <td className="mono text-right">{formatKES(b.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="j-h">
        <h2 id="j-h" className="t3">Recent journals</h2>
        <ul className="flex flex-col gap-3">
          {journals.map((j) => (
            <li key={j.id} className="card flex flex-col gap-2 p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold">{j.memo ?? j.kind}</span>
                <span className="mono text-xs text-ink-2">{formatDate(j.posted_at)} {formatTime(j.posted_at)} · {j.posted_by}</span>
              </div>
              <table className="table-k">
                <tbody>
                  {j.entries.map((e, i) => (
                    <tr key={i}>
                      <td>{NAMES[e.account] ?? e.account}</td>
                      <td className="mono text-right">{e.side === "debit" ? formatKES(e.amount_kes) : ""}</td>
                      <td className="mono text-right">{e.side === "credit" ? formatKES(e.amount_kes) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </li>
          ))}
          {!journals.length ? <p className="empty">No journals yet.</p> : null}
        </ul>
      </section>
    </div>
  );
}
