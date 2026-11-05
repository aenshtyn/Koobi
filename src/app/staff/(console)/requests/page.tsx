import type { Metadata } from "next";
import Link from "next/link";
import { Guarded } from "@/components/app/shell";
import { RequestPill } from "@/components/app/request-pill";
import { STAFF_ROLES } from "@/lib/auth";
import { getRequestQueue } from "@/lib/data/matching";
import { slaFor } from "@/domain/matching";
import { categoryByCode, TRACKS, type TrackCode } from "@/domain/taxonomy";
import { formatDate, formatKES, formatTime } from "@/domain/format";

export const metadata: Metadata = { title: "Requests", robots: { index: false } };

const VIEWS = [
  ["open", "Waiting for a shortlist"],
  ["shortlisted", "Shortlist sent"],
  ["closed", "Closed"],
] as const;

export default function RequestQueuePage(props: PageProps<"/staff/requests">) {
  return (
    <Guarded next="/staff/requests" anyOf={STAFF_ROLES}>
      <Queue searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Queue({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const view = (VIEWS.find(([v]) => v === sp.view)?.[0] ?? "open") as (typeof VIEWS)[number][0];
  const track = typeof sp.track === "string" && sp.track in TRACKS ? (sp.track as TrackCode) : null;
  const rows = (await getRequestQueue(view)).filter((r) => !track || r.track === track);
  const now = new Date();
  const qs = (v: string, t: string | null) => `/staff/requests?view=${v}${t ? `&track=${t}` : ""}`;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="t1">Requests</h1>
        <p className="text-ink-2">Oldest first. Shortlist three within 24 hours; aim to match within 48.</p>
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="Views">
        {VIEWS.map(([v, l]) => (
          <Link key={v} className={`chip${v === view ? " on" : ""}`} href={qs(v, track)}>
            {l}
          </Link>
        ))}
        <span className="mx-2 border-l border-line-2" aria-hidden="true" />
        <Link className={`chip sm${!track ? " on" : ""}`} href={qs(view, null)}>
          All tracks
        </Link>
        {(Object.keys(TRACKS) as TrackCode[]).map((t) => (
          <Link key={t} className={`chip sm${t === track ? " on" : ""}`} href={qs(view, t)}>
            {TRACKS[t].label}
          </Link>
        ))}
      </nav>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="table-k min-w-[760px]">
            <thead>
              <tr>
                <th scope="col">Request</th>
                <th scope="col">Category</th>
                <th scope="col">Budget</th>
                <th scope="col">Sent</th>
                <th scope="col">Timer</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const sla = slaFor(r.status, r.submitted_at, now);
                return (
                  <tr key={r.id}>
                    <td>
                      <Link className="font-semibold" href={`/staff/requests/${r.id}`}>
                        {r.subject}
                      </Link>
                      <p className="help line-clamp-1">{r.goal}</p>
                    </td>
                    <td className="text-ink-2">{categoryByCode(r.category)?.short}</td>
                    <td className="mono">{r.budget_max_kes ? formatKES(r.budget_max_kes) : "—"}</td>
                    <td className="mono text-[13px]">
                      {formatDate(r.submitted_at)} {formatTime(r.submitted_at)}
                    </td>
                    <td className={sla?.overdue ? "font-semibold text-error" : "text-ink-2"}>{sla ? sla.label : "—"}</td>
                    <td>
                      <RequestPill status={r.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">Nothing here.</p>
      )}
    </div>
  );
}
