/**
 * Double-entry postings (PRD FR-LEDGER-2). Every journal must balance; Postgres enforces the
 * same rule. Amounts are whole KES.
 */
import { splitSession } from "./commission";

export type Account =
  | "cash_provider"
  | "client_funds_held"
  | "guardian_credits"
  | "teacher_payable"
  | "withholding_payable"
  | "vat_payable"
  | "revenue_commission"
  | "expense_payment_fees"
  | "expense_payout_fees"
  | "expense_trial_subsidy";

export type Line = { account: Account; debit: number; credit: number };
export type Journal = { event: string; lines: Line[] };

const dr = (account: Account, amount: number): Line => ({ account, debit: amount, credit: 0 });
const cr = (account: Account, amount: number): Line => ({ account, debit: 0, credit: amount });

export function assertBalanced(j: Journal): Journal {
  const d = j.lines.reduce((s, l) => s + l.debit, 0);
  const c = j.lines.reduce((s, l) => s + l.credit, 0);
  if (d !== c) throw new Error(`Unbalanced journal ${j.event}: debits ${d} credits ${c}`);
  if (j.lines.some((l) => l.debit < 0 || l.credit < 0 || !Number.isInteger(l.debit) || !Number.isInteger(l.credit))) {
    throw new Error(`Invalid amounts in ${j.event}`);
  }
  return j;
}

export function paymentSucceeded(priceKes: number, providerFeeKes: number): Journal {
  return assertBalanced({
    event: "payment.succeeded",
    lines: [dr("cash_provider", priceKes - providerFeeKes), dr("expense_payment_fees", providerFeeKes), cr("client_funds_held", priceKes)],
  });
}

export function sessionConfirmed(priceKes: number, rate: number, vatRegistered: boolean): Journal[] {
  const s = splitSession({ priceKes, rate, vatRegistered });
  const out: Journal[] = [
    assertBalanced({
      event: "session.confirmed",
      lines: [
        dr("client_funds_held", s.price),
        cr("revenue_commission", s.commission),
        cr("teacher_payable", s.teacherNet),
        cr("withholding_payable", s.withholding),
      ],
    }),
  ];
  if (vatRegistered && s.vatOnFee > 0) {
    out.push(assertBalanced({ event: "vat.on_fee", lines: [dr("revenue_commission", s.vatOnFee), cr("vat_payable", s.vatOnFee)] }));
  }
  return out;
}

export function payoutSent(netKes: number, feeKes: number): Journal {
  return assertBalanced({
    event: "payout.sent",
    lines: [dr("teacher_payable", netKes), dr("expense_payout_fees", feeKes), cr("cash_provider", netKes + feeKes)],
  });
}

/** Net balance per account (credit-positive for liabilities and revenue). */
export function balances(journals: Journal[]): Partial<Record<Account, number>> {
  const out: Partial<Record<Account, number>> = {};
  for (const j of journals) for (const l of j.lines) out[l.account] = (out[l.account] ?? 0) + l.credit - l.debit;
  return out;
}
