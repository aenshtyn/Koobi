import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Guarded } from "@/components/app/shell";
import { RequestPill } from "@/components/app/request-pill";
import { STAFF_ROLES, getSessionUser } from "@/lib/auth";
import { getConsole } from "@/lib/data/matching";
import { rankCandidates, slaFor } from "@/domain/matching";
import { categoryByCode, TRACKS, type TrackCode } from "@/domain/taxonomy";
import { formatDate, formatKES, formatTime } from "@/domain/format";
import { ShortlistForm, UnmatchedForm } from "../console-forms";

export const metadata: Metadata = { title: "Matching console", robots: { index: false } };

export default function ConsolePage(props: PageProps<"/staff/requests/[id]">) {
  return (
    <Guarded next="/staff/requests" anyOf={STAFF_ROLES}>
      <Console params={props.params} searchParams={props.searchParams} />
    </Guarded>
  );
}

const MATCH_LABEL: Record<string, string> = { proposed: "Draft", sent: "Sent", accepted: "Chosen", declined: "Declined", expired: "Expired" };

async function Console({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, getSessionUser()]);
  const view = await getConsole(id);
  if (!view) notFound();
  const { request: r } = view;
  const ranked = rankCandidates(r, view.candidates).filter((c) => !view.matches.some((m) => m.offering_id === c.offering_id && m.status !== "proposed"));
  const sla = slaFor(r.status, r.submitted_at, new Date());
  const open = r.status === "submitted" || r.status === "triaged";
  const canAct = !!user?.roles.some((x) => x === "concierge" || x === "admin");
  return (
    <div className="flex max-w-[980px] flex-col gap-7">
      <Link className="btn3 self-start" href="/staff/requests">
        All requests
      </Link>
      {sp.sent ? (
        <div className="panel escrow items-center" role="status">
          <span className="seal" aria-hidden="true" />
          <p>
            <b>Shortlist sent.</b> The learner can now choose; the request waits under “Shortlist sent”.
          </p>
        </div>
      ) : null}
      <section className="card flex flex-col gap-3 p-6" aria-labelledby="rq-h">
        <div className="flex flex-wrap items-center gap-3">
          <RequestPill status={r.status} />
          {sla ? <span className={sla.overdue ? "font-semibold text-error" : "help"}>{sla.label}</span> : null}
          <span className="help">
            Logged <span className="mono">{view.minutes}</span> min
          </span>
        </div>
        <h1 id="rq-h" className="t1">
          {r.subject}
        </h1>
        <p className="text-[17px]">{r.goal}</p>
        <dl className="grid gap-x-6 gap-y-2 text-[15px] sm:grid-cols-3">
          <div><dt className="help">From</dt><dd>{view.requesterName}</dd></div>
          <div><dt className="help">Category</dt><dd>{categoryByCode(r.category)?.label}</dd></div>
          <div><dt className="help">Track</dt><dd>{TRACKS[r.track as TrackCode]?.label ?? r.track}</dd></div>
          <div><dt className="help">Where</dt><dd>{r.mode.replace("_", " ")}{r.county ? `, ${r.county}` : ""}</dd></div>
          <div><dt className="help">Budget</dt><dd className="mono">{r.budget_max_kes ? `${formatKES(r.budget_max_kes)} / session` : "Not given"}</dd></div>
          <div><dt className="help">When</dt><dd>{r.schedule_notes ?? "—"}</dd></div>
          <div><dt className="help">Sent</dt><dd className="mono">{formatDate(r.submitted_at)} {formatTime(r.submitted_at)}</dd></div>
        </dl>
      </section>

      {view.matches.filter((m) => m.status !== "proposed").length ? (
        <section className="flex flex-col gap-3" aria-labelledby="hist-h">
          <h2 id="hist-h" className="t3">
            Sent so far
          </h2>
          <ul className="flex flex-col">
            {view.matches
              .filter((m) => m.status !== "proposed")
              .map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-line-2 py-2">
                  <span>
                    <span className="mono text-ink-2">#{m.rank}</span> {m.title}
                    {m.decline_reason ? <span className="help"> · “{m.decline_reason}”</span> : null}
                  </span>
                  <span className="pill">{MATCH_LABEL[m.status] ?? m.status}</span>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {open ? (
        <section className="flex flex-col gap-4" aria-labelledby="cand-h">
          <div className="flex flex-col gap-1">
            <h2 id="cand-h" className="t2">
              Candidates <span className="mono text-[16px] text-ink-2">{ranked.length}</span>
            </h2>
            <p className="help">Ranked by tier, rating, response time and hours on the platform. Ticks show which checks each one passes.</p>
          </div>
          {ranked.length ? (
            <ShortlistForm requestId={r.id} candidates={ranked} canAct={canAct} />
          ) : (
            <p className="empty">No published learning experiences on this track yet. Recruit for it, or close as unmatched with the reason.</p>
          )}
          {canAct ? <UnmatchedForm requestId={r.id} /> : null}
        </section>
      ) : null}
    </div>
  );
}
