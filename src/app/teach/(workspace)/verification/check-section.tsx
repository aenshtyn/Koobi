import { CheckCircle2 } from "lucide-react";
import type { MyCheck, MyDoc } from "@/lib/data/verification";
import { CHECK_STATUS_LABELS, DOC_KINDS } from "@/domain/payouts";
import { formatDate } from "@/domain/format";
import type { CheckConfig } from "./config";
import { DetailsForm, UploadForm } from "./check-forms";

const TONE: Record<string, string> = {
  pending: "bg-sand text-ink",
  in_review: "bg-info-tint text-info",
  passed: "bg-forest-tint text-forest-ink",
  failed: "bg-error-tint text-error",
  expired: "bg-sand text-ink-2",
};

export function CheckPill({ status }: { status: string | null }) {
  return <span className={`pill ${TONE[status ?? "pending"] ?? "bg-sand text-ink"}`}>{status ? CHECK_STATUS_LABELS[status] : "Not started"}</span>;
}

/** One check: status, why it failed, what was uploaded, and the forms while it waits for the teacher. */
export function CheckSection({ config, check, docs, path, offeringId = null }: { config: CheckConfig; check: MyCheck | null; docs: MyDoc[]; path: string; offeringId?: string | null }) {
  const mine = check ? docs.filter((d) => d.check_id === check.id) : [];
  const open = !check || check.status === "pending" || check.status === "failed" || check.status === "expired";
  const fresh = !check || check.status !== "pending";
  return (
    <section className="card flex flex-col gap-4 p-5" aria-labelledby={`${config.type}-h`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${config.type}-h`} className="t3">
          {config.title}
        </h2>
        <CheckPill status={check?.status ?? null} />
      </div>
      <p className="help">{config.intro}</p>
      {check?.status === "passed" ? (
        <p className="panel escrow">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>
            Passed {check.passed_at ? <span className="mono">{formatDate(check.passed_at)}</span> : null}
            {check.expires_at ? (
              <>
                {" "}
                · valid until <span className="mono">{formatDate(check.expires_at)}</span>
              </>
            ) : null}
            {check.badge_label ? <> · shows as “{check.badge_label}”</> : null}
          </span>
        </p>
      ) : null}
      {check?.status === "in_review" ? <p className="panel info">With a reviewer. The result shows here.</p> : null}
      {check?.status === "failed" && check.failure_reason ? (
        <p className="panel error">
          Not passed: {check.failure_reason}. You can try again (attempt {check.attempt_no + 1}).
        </p>
      ) : null}
      {mine.length ? (
        <ul className="flex flex-col">
          {mine.map((d, i) => (
            <li key={i} className="flex justify-between gap-3 border-b border-dashed border-line-2 py-2 text-[15px]">
              <span>{DOC_KINDS[d.kind] ?? d.kind}</span>
              <span className="help mono">{formatDate(d.uploaded_at)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <div className="flex flex-col gap-5">
          {config.kinds.length ? <UploadForm config={config} path={path} offeringId={offeringId} /> : null}
          {config.kinds.length ? <hr className="rule" /> : null}
          <DetailsForm config={config} path={path} offeringId={offeringId} canSend={!config.kinds.length || (!fresh && mine.length > 0)} />
        </div>
      ) : null}
    </section>
  );
}
