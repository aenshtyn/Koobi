import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Guarded } from "@/components/app/shell";
import { getReviewItem } from "@/lib/data/verification";
import { CHECK_STATUS_LABELS, DOC_KINDS } from "@/domain/payouts";
import { formatDate, formatTime } from "@/domain/format";
import { viewDocument } from "../actions";
import { ReviewForm } from "../review-form";

export const metadata: Metadata = { title: "Check review", robots: { index: false } };

const EXPIRING = ["good_conduct", "credential_professional", "identity_iprs"];

/** S4: documents by signed URL, every view logged; pass or fail with minutes. */
export default function ReviewPage(props: PageProps<"/staff/verification/[id]">) {
  return (
    <Guarded next="/staff/verification" anyOf={["reviewer", "admin"]}>
      <Review params={props.params} searchParams={props.searchParams} />
    </Guarded>
  );
}

function Submitted({ value }: { value: unknown }) {
  if (!value || typeof value !== "object") return null;
  const entries = Object.entries(value as Record<string, unknown>);
  return (
    <dl className="flex flex-col">
      {entries.map(([k, v]) => (
        <div key={k} className="kv">
          <span>{k.replace(/_/g, " ")}</span>
          <span className="font-sans! whitespace-pre-line text-right">
            {Array.isArray(v) ? v.map((x) => Object.values(x as Record<string, string>).join(" · ")).join("\n") : String(v)}
          </span>
        </div>
      ))}
    </dl>
  );
}

async function Review({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const found = await getReviewItem(id);
  if (!found) notFound();
  const { item: c, docs } = found;
  const rs = c.result_summary as { submitted?: unknown; recipient_name?: string; amount_kes?: number; review_note?: string };
  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <Link className="btn3 self-start" href="/staff/verification">
        Verification queue
      </Link>
      {typeof sp.error === "string" ? <p className="panel error">{sp.error}</p> : null}
      <div className="flex flex-col gap-1">
        <h1 className="t1">{c.check?.label ?? c.check_type}</h1>
        <p className="text-ink-2">
          {c.teacher?.display_name} · level {c.tier} · attempt {c.attempt_no} · {CHECK_STATUS_LABELS[c.status]}
        </p>
      </div>
      {c.check_type === "payout_ownership" ? (
        <div className="card flex flex-col p-5">
          <div className="kv">
            <span>Name M-Pesa returned</span>
            <span className="font-sans!">{rs.recipient_name || "Not returned; call the teacher"}</span>
          </div>
          <div className="kv">
            <span>Name on Koobi</span>
            <span className="font-sans!">{c.teacher?.display_name}</span>
          </div>
          <p className="help mt-2">Pass only if the M-Pesa name matches the name on the teacher’s ID check.</p>
        </div>
      ) : null}
      {rs.submitted ? (
        <section className="card p-5" aria-label="Submitted details">
          <h2 className="t3 mb-2">What the teacher sent</h2>
          <Submitted value={rs.submitted} />
        </section>
      ) : null}
      <section className="flex flex-col gap-2" aria-label="Documents">
        <h2 className="t3">Documents</h2>
        {docs.length ? (
          <ul className="card flex flex-col divide-y divide-dashed divide-line-2 p-0!">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span>
                  {DOC_KINDS[d.kind] ?? d.kind}{" "}
                  <span className="help mono">
                    {formatDate(d.uploaded_at)} {formatTime(d.uploaded_at)}
                  </span>
                </span>
                <form action={viewDocument}>
                  <input type="hidden" name="document_id" value={d.id} />
                  <input type="hidden" name="check_id" value={c.id} />
                  <button className="btn3" type="submit">
                    Open (logged)
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="help">No documents for this check.</p>
        )}
      </section>
      {c.status === "in_review" ? (
        <ReviewForm checkId={c.id} expires={EXPIRING.includes(c.check_type)} />
      ) : (
        <p className="panel info">
          {CHECK_STATUS_LABELS[c.status]}
          {c.failure_reason ? `: ${c.failure_reason}` : ""}
          {rs.review_note && !c.failure_reason ? ` · ${rs.review_note}` : ""}
        </p>
      )}
    </div>
  );
}
