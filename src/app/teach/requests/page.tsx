import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Inbox } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { getTeacherInbox } from "@/lib/data/matching";
import { getMyTeacher } from "@/lib/data/listings";
import { categoryByCode } from "@/domain/taxonomy";
import { formatDate, formatKES } from "@/domain/format";
import { OFFER_MODES } from "@/domain/listing-input";

export const metadata: Metadata = { title: "Requests" };

const modeLabel = (m: string) => (m === "hybrid" ? "Online or in person" : OFFER_MODES.find(([c]) => c === m)?.[1] ?? m);

export default function TeachRequestsPage(props: PageProps<"/teach/requests">) {
  return (
    <Guarded next="/teach/requests">
      <div className="flex max-w-[900px] flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="t1">Requests</h1>
          <p className="text-ink-2">
            Open requests that fit your approved offers. Apply with a short pitch; the concierge picks up to three for each learner.
          </p>
        </div>
        <Suspense fallback={null}>
          <Applied searchParams={props.searchParams} />
        </Suspense>
        <List />
      </div>
    </Guarded>
  );
}

async function Applied({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { applied } = await searchParams;
  return applied ? (
    <div className="panel escrow items-center" role="status">
      <span className="seal" aria-hidden="true" />
      <p>
        <b>Applied.</b> The concierge sees your pitch next to the other candidates.
      </p>
    </div>
  ) : null;
}

async function List() {
  const [teacher, inbox] = await Promise.all([getMyTeacher(), getTeacherInbox()]);
  if (!teacher || teacher.listing_status !== "approved") {
    return (
      <div className="empty">
        <Inbox size={24} aria-hidden="true" />
        <p className="font-semibold">Requests appear once your profile and an offer are approved.</p>
        <Link className="btn3" href="/teach">
          See what is left to do
        </Link>
      </div>
    );
  }
  if (!inbox.length) {
    return (
      <div className="empty">
        <Inbox size={24} aria-hidden="true" />
        <p className="font-semibold">No open requests fit your offers right now.</p>
        <p className="help">New requests show here as they arrive.</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {inbox.map((r) => (
        <li key={r.id} className="card flex flex-col gap-2 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="t3">{r.subject}</h2>
            <span className="mono text-xs text-ink-2">{formatDate(r.created_at)}</span>
          </div>
          <p>{r.goal}</p>
          <p className="help">
            {categoryByCode(r.category)?.short} · {modeLabel(r.mode)}
            {r.county ? ` · ${r.county}` : ""}
            {r.budget_max_kes ? <> · up to <span className="mono">{formatKES(r.budget_max_kes)}</span> a session</> : null}
            {r.schedule_notes ? ` · ${r.schedule_notes}` : ""}
          </p>
          <div>
            {r.applied ? (
              <span className="pill bg-forest-tint text-forest-ink">Applied</span>
            ) : (
              <Link className="btn2" href={`/teach/requests/${r.id}/apply`}>
                Apply
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
