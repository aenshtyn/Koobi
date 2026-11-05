import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Guarded } from "@/components/app/shell";
import { getMyDispute } from "@/lib/data/lessons";
import { DISPUTE_OUTCOME_LABELS, DISPUTE_STATUS_LABELS, KIND_LABELS, PROBLEM_TYPES } from "@/domain/booking";
import { formatDate, formatKES, formatTime } from "@/domain/format";

export const metadata: Metadata = { title: "Problem reported" };

const STEPS = ["open", "in_review", "resolved"] as const;

/** L17: where a reported problem stands (FR-DISP-2, -3). */
export default function DisputePage(props: PageProps<"/disputes/[id]">) {
  return (
    <Guarded next="/sessions">
      <Dispute params={props.params} searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Dispute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const found = await getMyDispute(id);
  if (!found) notFound();
  const { dispute: d, booking: b } = found;
  const at = STEPS.indexOf((d.status === "closed" ? "resolved" : ["awaiting_party", "escalated", "reopened"].includes(d.status) ? "in_review" : d.status) as (typeof STEPS)[number]);
  const decided = d.status === "resolved" || d.status === "closed";
  return (
    <div className="flex max-w-[620px] flex-col gap-6">
      <Link className="btn3 self-start" href={`/bookings/${b.id}`}>
        Back to the booking
      </Link>
      {sp.sent ? (
        <p className="panel escrow" role="status">
          Sent. The concierge will reply within {d.type === "safety" ? "24" : "72"} hours. Payment stays on hold until then.
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <h1 className="t1">{PROBLEM_TYPES[d.type] ?? "Problem reported"}</h1>
        <p className="text-ink-2">
          {KIND_LABELS[b.kind]} with {b.teacher_name} · <span className="mono">{formatDate(b.starts_at)}</span>
        </p>
      </div>
      <div className="steps" role="group" aria-label={`Step ${at + 1} of 3`}>
        {["Received", "Being reviewed", "Decided"].map((label, i) => (
          <Fragment key={label}>
            {i > 0 ? <span className={`bar${i <= at ? " done" : ""}`} aria-hidden="true" /> : null}
            <span className={i < at || (i === at && decided) ? "done" : i === at ? "cur" : undefined}>
              <span className="n">{i + 1}</span> {label}
            </span>
          </Fragment>
        ))}
      </div>
      <div className="card flex flex-col p-5">
        <div className="kv">
          <span>Status</span>
          <span className="font-sans!">{DISPUTE_STATUS_LABELS[d.status] ?? d.status}</span>
        </div>
        <div className="kv">
          <span>Reported</span>
          <span>
            {formatDate(d.created_at)} {formatTime(d.created_at)}
          </span>
        </div>
        {!decided ? (
          <div className="kv">
            <span>Answer due by</span>
            <span>
              {formatDate(d.sla_due_at)} {formatTime(d.sla_due_at)}
            </span>
          </div>
        ) : null}
        {d.description ? <p className="mt-3 whitespace-pre-line text-ink-2">{d.description}</p> : null}
      </div>
      {decided && d.outcome ? (
        <section className="panel escrow flex-col" aria-label="Decision">
          <b>{DISPUTE_OUTCOME_LABELS[d.outcome] ?? d.outcome}</b>
          {d.credit_kes > 0 && d.refund_kes === 0 ? <span>Credit added: <span className="mono">{formatKES(d.credit_kes)}</span></span> : null}
          {d.refund_kes > 0 ? <span>Refund to M-Pesa: <span className="mono">{formatKES(d.refund_kes)}</span></span> : null}
          {d.evidence_snapshot?.resolution_note ? <span>{d.evidence_snapshot.resolution_note}</span> : null}
        </section>
      ) : null}
      {decided && d.outcome === "replacement" ? (
        <Link className="btn self-start" href={`/requests/replacement?booking=${b.id}`}>
          Find me a new teacher
        </Link>
      ) : null}
    </div>
  );
}
