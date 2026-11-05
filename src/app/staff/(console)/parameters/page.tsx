import type { Metadata } from "next";
import { Guarded } from "@/components/app/shell";
import { getSessionUser } from "@/lib/auth";
import { getParameters } from "@/lib/data/staff-admin";
import { formatDate, formatTime } from "@/domain/format";
import { addParameter, setFlag } from "../admin-actions";

export const metadata: Metadata = { title: "Parameters and flags", robots: { index: false } };

/** S21: dated rates and feature flags (§6.4 rule 4). A change is a new row from a date; nothing is overwritten. */
export default function ParametersPage(props: PageProps<"/staff/parameters">) {
  return (
    <Guarded next="/staff/parameters" anyOf={["concierge", "finance", "admin"]}>
      <Parameters searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Parameters({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, { params, flags }, user] = await Promise.all([searchParams, getParameters(), getSessionUser()]);
  const canEdit = !!user?.roles.some((r) => r === "finance" || r === "admin");
  const admin = !!user?.roles.includes("admin");
  const now = new Date().toISOString();
  const keys = [...new Set(params.map((p) => p.key))];
  return (
    <div className="flex flex-col gap-8">
      <h1 className="t1">Parameters and flags</h1>
      {typeof sp.done === "string" ? <p className="panel escrow" role="status">{sp.done}</p> : null}
      {typeof sp.error === "string" ? <p className="panel error" role="alert">{sp.error}</p> : null}
      {canEdit ? (
        <form action={addParameter} className="card flex flex-col gap-4 p-5">
          <h2 className="t3">Schedule a change</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="field">
              <label className="label" htmlFor="key">Parameter</label>
              <select id="key" name="key" className="input" required>
                {keys.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="value">New value</label>
              <input id="value" name="value" className="input mono" placeholder='24 or 0.18 or {"basis": …}' required />
            </div>
            <div className="field">
              <label className="label" htmlFor="effective_from">From (Nairobi time)</label>
              <input id="effective_from" name="effective_from" type="datetime-local" className="input mono" />
            </div>
            <div className="field"><label className="label" htmlFor="track">Track (optional)</label><input id="track" name="track" className="input mono" /></div>
            <div className="field"><label className="label" htmlFor="format">Format (optional)</label><input id="format" name="format" className="input mono" /></div>
            <div className="field"><label className="label" htmlFor="mode">Mode (optional)</label><input id="mode" name="mode" className="input mono" /></div>
          </div>
          <div className="field">
            <label className="label" htmlFor="note">Why</label>
            <input id="note" name="note" className="input" required minLength={5} />
          </div>
          <button className="btn2 self-start" type="submit">Schedule</button>
        </form>
      ) : null}
      <div className="overflow-x-auto">
        <table className="table-k min-w-[900px]">
          <thead>
            <tr><th scope="col">Parameter</th><th scope="col">Scope</th><th scope="col">Value</th><th scope="col">From</th><th scope="col">Note</th></tr>
          </thead>
          <tbody>
            {params.map((p) => (
              <tr key={p.id} className={p.effective_from > now ? "bg-orange-wash/40" : undefined}>
                <td className="mono">{p.key}</td>
                <td className="mono text-[13px]">{[p.track, p.format, p.mode].filter(Boolean).join(" · ") || "all"}</td>
                <td className="mono max-w-[280px] break-words text-[13px]">{JSON.stringify(p.value)}</td>
                <td className="mono text-[13px]">{formatDate(p.effective_from)} {formatTime(p.effective_from)}{p.effective_from > now ? " (scheduled)" : ""}</td>
                <td className="help">{p.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="flex flex-col gap-3" aria-labelledby="f-h">
        <h2 id="f-h" className="t3">Feature flags</h2>
        <ul className="card flex flex-col divide-y divide-dashed divide-line-2 p-0!">
          {flags.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <span className="flex flex-col">
                <span className="mono">{f.key}{f.track ? ` · ${f.track}` : ""}</span>
                <span className="help">{f.description}</span>
              </span>
              {admin ? (
                <form action={setFlag}>
                  <input type="hidden" name="flag_id" value={f.id} />
                  <input type="hidden" name="enabled" value={String(!f.enabled)} />
                  <button className="btn3" type="submit">{f.enabled ? "On · turn off" : "Off · turn on"}</button>
                </form>
              ) : (
                <span>{f.enabled ? "On" : "Off"}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
