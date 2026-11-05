import type { Metadata } from "next";
import Link from "next/link";
import { Guarded } from "@/components/app/shell";
import { getGuardian } from "@/lib/data/account";
import { IdSubmitForm, IdUploadForm } from "../forms";

export const metadata: Metadata = { title: "Your ID check" };

/** L21: required before in-person lessons for a child (FR-ACC-6). Protects teachers who travel to homes. */
export default function IdentityPage(props: PageProps<"/account/identity">) {
  return (
    <Guarded next="/account/identity">
      <Identity searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Identity({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, { guardian, check }] = await Promise.all([searchParams, getGuardian()]);
  const status = guardian?.identity_check_status ?? "none";
  return (
    <div className="flex max-w-[620px] flex-col gap-6">
      <Link className="btn3 self-start" href="/account/learners">
        Children
      </Link>
      <h1 className="t1">Your ID check</h1>
      <p className="text-ink-2">Teachers travel to homes, so a parent’s ID is checked once before the first in-person lesson for a child. Online lessons do not need it.</p>
      {sp.done === "uploaded" ? <p className="panel escrow" role="status">Uploaded. Add the other photo, then send it.</p> : null}
      {sp.done === "sent" ? <p className="panel escrow" role="status">Sent. A reviewer checks it; the result shows here.</p> : null}
      {status === "passed" ? <p className="panel escrow">Checked. In-person lessons for your children are open.</p> : null}
      {check?.status === "in_review" ? <p className="panel info">With a reviewer.</p> : null}
      {check?.status === "failed" ? <p className="panel error">Not passed: {check.failure_reason}. Upload clearer photos and send again.</p> : null}
      {status !== "passed" && check?.status !== "in_review" ? (
        <div className="card flex flex-col gap-5 p-5">
          <p className="help">Upload the front of your ID (or passport) and a photo of you holding it.</p>
          <IdUploadForm />
          <hr className="rule" />
          <IdSubmitForm />
        </div>
      ) : null}
    </div>
  );
}
