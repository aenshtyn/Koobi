import type { Metadata } from "next";
import Link from "next/link";
import { Guarded } from "@/components/app/shell";
import { getPilotMetrics } from "@/lib/data/staff-admin";
import { formatDate, formatKES, formatTime } from "@/domain/format";

export const metadata: Metadata = { title: "Pilot metrics", robots: { index: false } };

const TRACKS: [string | null, string][] = [[null, "All"], ["school", "School"], ["adults_professional", "Adults"], ["practical", "Practical"]];

/**
 * S25: the seven decision metrics of the pilot plan (IDEA §12), with the threshold to continue beside
 * each. Thresholds are decision rules for this pilot, not industry benchmarks.
 */
export default function PilotPage(props: PageProps<"/staff/reports/pilot">) {
  return (
    <Guarded next="/staff/reports/pilot" anyOf={["concierge", "finance", "admin"]}>
      <Pilot searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Pilot({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const track = typeof sp.track === "string" && TRACKS.some(([t]) => t === sp.track) ? sp.track : null;
  const data = await getPilotMetrics(track);
  return (
    <div className="flex max-w-[960px] flex-col gap-6">
      <h1 className="t1">Pilot metrics</h1>
      <nav className="flex flex-wrap gap-2" aria-label="Track">
        {TRACKS.map(([t, label]) => (
          <Link key={label} className={`chip sm${track === t ? " on" : ""}`} href={t ? `/staff/reports/pilot?track=${t}` : "/staff/reports/pilot"}>{label}</Link>
        ))}
      </nav>
      {data ? (
        <>
          <p className="help">
            Computed <span className="mono">{formatDate(data.computed_at)} {formatTime(data.computed_at)}</span> from bookings, requests and the ledger. Not enough data shows as “—”.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {data.metrics.map((m) => {
              const money = m.id === "M6";
              const value = money ? (m.value ?? null) : m.den > 0 ? m.num / m.den : null;
              const pass = value === null ? null : m.rule === "above" ? value > m.threshold : value >= m.threshold;
              return (
                <div key={m.id} className={`stat ${pass === false ? "border-error!" : ""}`}>
                  <span className="help">{m.id} · {m.label}</span>
                  <span className="v">{value === null ? "—" : money ? formatKES(value) : `${Math.round(value * 100)}%`}</span>
                  <span className="help">
                    {money ? `${m.rule === "above" ? "Above" : "At least"} ${formatKES(m.threshold)}` : `${m.rule === "above" ? "Above" : "At least"} ${Math.round(m.threshold * 100)}%`}
                    {" · "}
                    {money ? `${m.den} active learners` : `${m.num} of ${m.den}`}
                    {pass === null ? "" : pass ? " · on track" : " · below"}
                  </span>
                  {m.note ? <span className="help">{m.note}</span> : null}
                </div>
              );
            })}
          </div>
          <p className="help">
            M6 counts fees earned less trial discounts, payment and payout fees and verification costs. Staff time and acquisition are not costed in the app;
            the logged minutes are shown so they can be added.
          </p>
        </>
      ) : (
        <p className="empty">Not connected to the database.</p>
      )}
    </div>
  );
}
