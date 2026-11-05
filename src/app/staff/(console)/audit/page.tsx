import type { Metadata } from "next";
import Link from "next/link";
import { Guarded } from "@/components/app/shell";
import { getAudit } from "@/lib/data/staff-admin";
import { formatDate, formatTime } from "@/domain/format";

export const metadata: Metadata = { title: "Audit log", robots: { index: false } };

const FILTERS = ["document.view", "verification", "payout", "ledger", "role", "parameter", "template", "data_request", "teacher", "guardian"];

/** S24: every sensitive read and write (NFR-1). Append-only in the database. */
export default function AuditPage(props: PageProps<"/staff/audit">) {
  return (
    <Guarded next="/staff/audit" anyOf={["finance", "admin"]}>
      <Audit searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Audit({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const action = typeof sp.action === "string" && FILTERS.includes(sp.action) ? sp.action : null;
  const rows = await getAudit(action);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="t1">Audit log</h1>
      <nav className="flex flex-wrap gap-2" aria-label="Filter">
        <Link className={`chip sm${!action ? " on" : ""}`} href="/staff/audit">All</Link>
        {FILTERS.map((f) => (
          <Link key={f} className={`chip sm${action === f ? " on" : ""}`} href={`/staff/audit?action=${f}`}>{f}</Link>
        ))}
      </nav>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="table-k min-w-[900px]">
            <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">What</th><th scope="col">On</th><th scope="col">Reason</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono text-[13px]">{formatDate(r.at)} {formatTime(r.at)}</td>
                  <td className="mono text-[13px]">{r.actor.replace(/^user:(.{8}).*/, "user:$1…")}</td>
                  <td className="mono text-[13px]">{r.action}</td>
                  <td className="mono text-[13px]">{r.entity_type}{r.entity_id ? ` ${r.entity_id.slice(0, 8)}…` : ""}</td>
                  <td className="help">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">Nothing recorded yet.</p>
      )}
    </div>
  );
}
