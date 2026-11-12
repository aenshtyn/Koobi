import type { Metadata } from "next";
import Link from "next/link";
import { Guarded } from "@/components/app/shell";
import { getMyChecks, latest } from "@/lib/data/verification";
import { getMyTeacherPayout } from "@/lib/data/earnings";
import { formatDate } from "@/domain/format";
import { TEST_PAYOUT_KES } from "@/lib/payouts";
import { CheckPill } from "../check-section";
import { TestPayoutForm } from "../check-forms";

export const metadata: Metadata = { title: "Payout number" };

/** T4: a test payout proves the M-Pesa number is yours (FR-VER-2). */
export default function PayoutNumberPage(props: PageProps<"/teach/verification/payout-number">) {
  return (
    <Guarded next="/teach/verification/payout-number">
      <Body searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Body({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, { checks }, payout] = await Promise.all([searchParams, getMyChecks(), getMyTeacherPayout()]);
  const check = latest(checks, "payout_ownership");
  return (
    <div className="flex max-w-[620px] flex-col gap-6">
      <Link className="btn3 self-start" href="/teach/verification">
        All checks
      </Link>
      <h1 className="t1">Payout number</h1>
      {sp.done === "sent" ? (
        <p className="panel escrow" role="status">
          Sent <span className="mono">KES {TEST_PAYOUT_KES}</span>. A reviewer compares the M-Pesa name with your ID.
        </p>
      ) : null}
      <div className="card flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">{payout.masked ? <span className="mono">{payout.masked}</span> : "No number saved"}</span>
          <CheckPill status={check?.status ?? null} />
        </div>
        <p className="help">
          We send <span className="mono">KES {TEST_PAYOUT_KES}</span> to the number. The name M-Pesa shows for it must match your ID. Your weekly payouts go only to a
          number that passed.
        </p>
        {check?.status === "failed" && check.failure_reason ? <p className="panel error">Not passed: {check.failure_reason}.</p> : null}
        {check?.status === "passed" ? (
          <p className="panel escrow">Passed {check.passed_at ? <span className="mono">{formatDate(check.passed_at)}</span> : null}.</p>
        ) : null}
        {check?.status === "pending" ? <TestPayoutForm /> : null}
        <Link className="btn3 self-start" href="/teach/settings">
          {payout.masked ? "Change the number" : "Add your M-Pesa number"}
        </Link>
      </div>
    </div>
  );
}
