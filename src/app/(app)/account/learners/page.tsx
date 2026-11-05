import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { getGuardian } from "@/lib/data/account";
import { withdrawConsent } from "../actions";

export const metadata: Metadata = { title: "Children" };

const CONSENT: Record<string, string> = { active: "Consent given", pending: "Consent missing", withdrawn: "Consent withdrawn" };

/** L19: child profiles for the school track (FR-ACC-5). */
export default function ChildrenPage(props: PageProps<"/account/learners">) {
  return (
    <Guarded next="/account/learners">
      <Children searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Children({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, { guardian, children }] = await Promise.all([searchParams, getGuardian()]);
  return (
    <div className="flex max-w-[680px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="t1">Children</h1>
        <Link className="btn2" href="/account/learners/new">
          Add a child
        </Link>
      </div>
      {sp.done === "added" ? <p className="panel escrow" role="status">Added, with your consent recorded.</p> : null}
      {sp.done === "withdrawn" ? <p className="panel info" role="status">Consent withdrawn. No new lessons can be booked for this child.</p> : null}
      {typeof sp.error === "string" ? <p className="panel error">{sp.error}</p> : null}
      {children.length ? (
        <ul className="flex flex-col gap-3">
          {children.map((c) => (
            <li key={c.id} className="card flex flex-wrap items-center justify-between gap-3 p-5">
              <span className="flex flex-col">
                <span className="font-semibold">{c.alias}</span>
                <span className="help">
                  Born <span className="mono">{c.year_of_birth}</span> · {CONSENT[c.consent_status] ?? c.consent_status}
                </span>
              </span>
              <span className="flex items-center gap-4">
                <Link className="btn3" href={`/learners/${c.id}/progress`}>
                  Lesson notes
                </Link>
                {c.consent_status === "active" ? (
                  <form action={withdrawConsent}>
                    <input type="hidden" name="learner_id" value={c.id} />
                    <button className="btn3" type="submit">
                      Withdraw consent
                    </button>
                  </form>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <Users size={24} aria-hidden="true" />
          <p className="font-semibold">No children added.</p>
          <p className="help">Add a child to book school lessons for them. Children never have their own account.</p>
        </div>
      )}
      {guardian ? (
        <Link className="panel info no-underline" href="/account/identity">
          {guardian.identity_check_status === "passed"
            ? "Your ID is checked: in-person lessons for your children are open."
            : "In-person lessons for a child need your ID check first. Online lessons do not."}
        </Link>
      ) : null}
    </div>
  );
}
