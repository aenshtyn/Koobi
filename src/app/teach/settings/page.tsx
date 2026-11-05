import type { Metadata } from "next";
import Link from "next/link";
import { Guarded } from "@/components/app/shell";
import { getMyTeacherPayout } from "@/lib/data/earnings";
import { CheckPill } from "../verification/check-section";
import { KraForm, PayoutForm } from "./forms";

export const metadata: Metadata = { title: "Settings" };

/** T28: KRA PIN and payout number (FR-PAYOUT-4). Notification choices arrive with notifications. */
export default function TeachSettingsPage(props: PageProps<"/teach/settings">) {
  return (
    <Guarded next="/teach/settings">
      <Settings searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Settings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, p] = await Promise.all([searchParams, getMyTeacherPayout()]);
  return (
    <div className="flex max-w-[620px] flex-col gap-6">
      <h1 className="t1">Settings</h1>
      {sp.done === "kra" ? (
        <p className="panel escrow" role="status">
          KRA PIN saved.
        </p>
      ) : null}
      {sp.done === "phone" ? (
        <p className="panel info" role="status">
          Number saved. {typeof sp.note === "string" ? `The test payout did not go through: ${sp.note}` : ""}
        </p>
      ) : null}
      <section className="card flex flex-col gap-4 p-5" aria-labelledby="pay-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="pay-h" className="t3">
            Payouts
          </h2>
          <CheckPill status={p.ownership === "passed" ? "passed" : p.ownership === "failed" ? "failed" : p.masked ? "in_review" : null} />
        </div>
        <PayoutForm saved={p.masked} />
        <Link className="btn3 self-start" href="/teach/verification/payout-number">
          Payout number check
        </Link>
      </section>
      <section className="card flex flex-col gap-4 p-5" aria-labelledby="tax-h">
        <h2 id="tax-h" className="t3">
          Tax
        </h2>
        <KraForm saved={p.kraMasked} />
      </section>
    </div>
  );
}
