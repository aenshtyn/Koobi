import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { getMyChecks, latest } from "@/lib/data/verification";
import { getMyApplication, getCredentials } from "@/lib/data/expert";
import { getMyTeacherPayout } from "@/lib/data/earnings";
import { formatDate } from "@/domain/format";
import { CheckPill } from "./check-section";

export const metadata: Metadata = { title: "Verification" };

/**
 * T2: what Koobi has checked. Identity and professional background are checked through the
 * application and the meeting; qualifications one by one; the payout number by a test payout.
 */
export default function VerificationPage() {
  return (
    <Guarded next="/teach/verification">
      <Checks />
    </Guarded>
  );
}

function Item({ href, title, text, status, pill }: { href: string; title: string; text: string; status?: string | null; pill?: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-5 text-ink no-underline hover:bg-orange-wash">
        <span className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
          <span className="t3">{title}</span>
          <span className="help">{text}</span>
        </span>
        {pill ?? <CheckPill status={status ?? null} />}
        <ArrowRight size={18} aria-hidden="true" className="text-ink-2" />
      </Link>
    </li>
  );
}

async function Checks() {
  const [{ checks }, { app }, payout] = await Promise.all([getMyChecks(), getMyApplication(), getMyTeacherPayout()]);
  const credentials = app ? await getCredentials(app.id) : [];
  const identity = latest(checks, "identity_iprs");
  const payoutCheck = latest(checks, "payout_ownership");
  const others = credentials.filter((c) => c.kind !== "identity");
  const verified = others.filter((c) => c.status === "approved").length;
  const waiting = others.filter((c) => c.status === "submitted").length;
  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="t1">Verification</h1>
        <p className="text-ink-2">What Koobi has checked about you. Learners see that you are verified and your verified qualifications, never your documents.</p>
      </div>
      <ul className="flex flex-col gap-3">
        <Item
          href="/teach/profile/credentials"
          title="Identity and professional background"
          text={identity?.passed_at ? `Verified through your application and meeting on ${formatDate(identity.passed_at)}.` : "Verified through your application and your meeting with Koobi."}
          status={identity?.status ?? (app?.application_status === "approved" ? "passed" : null)}
        />
        <Item
          href="/teach/profile/credentials"
          title="Qualifications, certifications and licences"
          text="Optional. Each one is verified on its own; only verified ones show on your public profile."
          pill={<span className={`pill ${verified ? "bg-forest-tint text-forest-ink" : "bg-sand text-ink"}`}>{verified ? `${verified} verified` : waiting ? `${waiting} waiting for review` : "None added"}</span>}
        />
        <Item
          href="/teach/verification/payout-number"
          title="M-Pesa payout number"
          text="A small test payout proves the number is yours. Learners can book you without it, but your earnings are paid out only once it is proven."
          status={payoutCheck?.status ?? null}
        />
        <Item
          href="/teach/settings"
          title="KRA PIN"
          text="Needed before your first payout, for the tax withheld on your behalf. Earnings wait until it is added."
          pill={<span className={`pill ${payout.kraMasked ? "bg-forest-tint text-forest-ink" : "bg-sand text-ink"}`}>{payout.kraMasked ? "Added" : "Not added"}</span>}
        />
      </ul>
      <Link className="btn3 self-start" href="/teach/waitlist">
        Where learners can find you
      </Link>
    </div>
  );
}
