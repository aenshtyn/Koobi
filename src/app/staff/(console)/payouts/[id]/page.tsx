import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Guarded } from "@/components/app/shell";
import { getSessionUser } from "@/lib/auth";
import { getBatch } from "@/lib/data/staff-money";
import { BATCH_STATUS_LABELS, PAYOUT_STATUS_LABELS } from "@/domain/payouts";
import { formatDate, formatKES, formatTime } from "@/domain/format";
import { approveBatch, cancelPayout, checkPayout, holdPayout, retryPayout, sendBatch } from "../actions";

export const metadata: Metadata = { title: "Payout batch", robots: { index: false } };

export default function BatchPage(props: PageProps<"/staff/payouts/[id]">) {
  return (
    <Guarded next="/staff/payouts" anyOf={["finance", "admin"]}>
      <Batch params={props.params} searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Batch({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, getSessionUser()]);
  const found = await getBatch(id);
  if (!found) notFound();
  const { batch: b, payouts, approvers } = found;
  const iApproved = b.approved_by === user?.id;
  const unapproved = b.status === "pending_approval" && !b.approved_by;
  return (
    <div className="flex flex-col gap-6">
      <Link className="btn3 self-start" href="/staff/payouts">
        All batches
      </Link>
      {typeof sp.done === "string" ? <p className="panel escrow" role="status">{sp.done}</p> : null}
      {typeof sp.error === "string" ? <p className="panel error" role="alert">{sp.error}</p> : null}
      <div className="flex flex-col gap-1">
        <h1 className="t1">
          Week of <span className="mono">{formatDate(b.week_start)}</span>
        </h1>
        <p className="text-ink-2">
          {BATCH_STATUS_LABELS[b.status]} · lessons released up to{" "}
          <span className="mono">
            {formatDate(b.cutoff_at)} {formatTime(b.cutoff_at)}
          </span>
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="stat"><span className="help">Teachers</span><span className="v">{b.teacher_count}</span></div>
        <div className="stat"><span className="help">Net to teachers</span><span className="v">{formatKES(b.net_kes)}</span></div>
        <div className="stat"><span className="help">Withholding to KRA</span><span className="v">{formatKES(b.withholding_kes)}</span></div>
        <div className="stat"><span className="help">Transfer fees</span><span className="v">{formatKES(b.fees_kes)}</span></div>
      </div>
      <div className="card flex flex-col gap-3 p-5">
        <p>
          First approval: {b.approved_by ? <b>{approvers[b.approved_by] ?? "Staff"}</b> : "none yet"} · Second approval:{" "}
          {b.second_approver ? <b>{approvers[b.second_approver] ?? "Staff"}</b> : "none yet"}
        </p>
        {b.status === "pending_approval" ? (
          iApproved ? (
            <p className="help">You gave the first approval. Someone else must give the second.</p>
          ) : (
            <form action={approveBatch}>
              <input type="hidden" name="batch_id" value={b.id} />
              <button className="btn self-start" type="submit" disabled={b.teacher_count === 0}>
                {b.approved_by ? "Give the second approval" : "Approve"}
              </button>
            </form>
          )
        ) : null}
        {b.status === "approved" || b.status === "sending" ? (
          <form action={sendBatch}>
            <input type="hidden" name="batch_id" value={b.id} />
            <button className="btn self-start" type="submit">
              Send to M-Pesa
            </button>
          </form>
        ) : null}
      </div>
      {payouts.length ? (
        <div className="overflow-x-auto">
          <table className="table-k min-w-[980px]">
            <thead>
              <tr>
                <th scope="col">Teacher</th>
                <th scope="col">Lessons</th>
                <th scope="col">Koobi fee</th>
                <th scope="col">Withholding</th>
                <th scope="col">Net</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id}>
                  <td>{p.teacher?.display_name ?? "—"}</td>
                  <td className="mono">{formatKES(p.gross_kes)}</td>
                  <td className="mono">{formatKES(p.platform_fee_kes)}</td>
                  <td className="mono">{formatKES(p.withholding_kes)}</td>
                  <td className="mono font-semibold">{formatKES(p.net_kes)}</td>
                  <td>
                    {PAYOUT_STATUS_LABELS[p.status] ?? p.status}
                    {p.exclusion_reason ? <p className="help">{p.exclusion_reason}</p> : null}
                    {p.last_error ? <p className="help">{p.last_error} · attempt {p.attempts}</p> : null}
                  </td>
                  <td>
                    {unapproved && p.status === "pending_approval" ? (
                      <form action={holdPayout} className="flex items-center gap-2">
                        <input type="hidden" name="payout_id" value={p.id} />
                        <input type="hidden" name="batch_id" value={b.id} />
                        <label className="sr-only" htmlFor={`r-${p.id}`}>Reason</label>
                        <input id={`r-${p.id}`} name="reason" className="input w-40" placeholder="Reason" required minLength={5} />
                        <button className="btn3" type="submit">Hold back</button>
                      </form>
                    ) : null}
                    {p.status === "sending" ? (
                      <form action={checkPayout}>
                        <input type="hidden" name="payout_id" value={p.id} />
                        <input type="hidden" name="batch_id" value={b.id} />
                        <button className="btn3" type="submit">Check with the provider</button>
                      </form>
                    ) : null}
                    {p.status === "failed" || p.status === "parked" ? (
                      <form action={retryPayout}>
                        <input type="hidden" name="payout_id" value={p.id} />
                        <input type="hidden" name="batch_id" value={b.id} />
                        <button className="btn3" type="submit">Send again</button>
                      </form>
                    ) : null}
                    {p.status === "parked" ? (
                      <form action={cancelPayout} className="mt-1 flex items-center gap-2">
                        <input type="hidden" name="payout_id" value={p.id} />
                        <input type="hidden" name="batch_id" value={b.id} />
                        <label className="sr-only" htmlFor={`c-${p.id}`}>Reason</label>
                        <input id={`c-${p.id}`} name="reason" className="input w-40" placeholder="Reason" required minLength={5} />
                        <button className="btn3" type="submit">Cancel</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">Nobody reached the payout threshold this week.</p>
      )}
    </div>
  );
}
