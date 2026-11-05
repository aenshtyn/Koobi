import type { Metadata } from "next";
import { Guarded } from "@/components/app/shell";
import { getSessionUser } from "@/lib/auth";
import { getGuardiansAndRequests } from "@/lib/data/staff-admin";
import { serverClient } from "@/lib/supabase/server";
import { formatDate } from "@/domain/format";
import { closeDataRequest, reviewGuardian, viewGuardianDocument } from "../admin-actions";

export const metadata: Metadata = { title: "Learners and parents", robots: { index: false } };

const KIND: Record<string, string> = { id_front: "ID, front", id_back: "ID, back", passport: "Passport", selfie: "Holding the ID" };

/** S19: parents, children (alias only), parent ID checks and data requests (FR-ACC-5..7). */
export default function LearnersPage(props: PageProps<"/staff/learners">) {
  return (
    <Guarded next="/staff/learners" anyOf={["concierge", "reviewer", "admin"]}>
      <Learners searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Learners({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, { guardians, checks, requests }, user] = await Promise.all([searchParams, getGuardiansAndRequests(), getSessionUser()]);
  const reviewer = !!user?.roles.some((r) => r === "reviewer" || r === "admin");
  const admin = !!user?.roles.includes("admin");
  const db = await serverClient();
  const docs = reviewer
    ? await Promise.all(checks.map(async (c) => ({ id: c.id, docs: ((await db.rpc("guardian_check_documents", { p_check: c.id })).data ?? []) as { id: string; kind: string }[] })))
    : [];
  return (
    <div className="flex flex-col gap-8">
      <h1 className="t1">Learners and parents</h1>
      {typeof sp.done === "string" ? <p className="panel escrow" role="status">{sp.done}</p> : null}
      {typeof sp.error === "string" ? <p className="panel error" role="alert">{sp.error}</p> : null}

      <section className="flex flex-col gap-3" aria-labelledby="id-h">
        <h2 id="id-h" className="t3">Parent ID checks waiting</h2>
        {checks.length ? (
          checks.map((c) => (
            <div key={c.id} className="card flex flex-col gap-3 p-5">
              <p>
                {guardians.find((g) => g.id === c.guardian_id)?.display_name ?? "Parent"} · sent <span className="mono">{formatDate(c.created_at)}</span>
              </p>
              <div className="flex flex-wrap gap-3">
                {(docs.find((d) => d.id === c.id)?.docs ?? []).map((d) => (
                  <form key={d.id} action={viewGuardianDocument}>
                    <input type="hidden" name="document_id" value={d.id} />
                    <button className="btn3" type="submit">Open {KIND[d.kind] ?? d.kind} (logged)</button>
                  </form>
                ))}
              </div>
              {reviewer ? (
                <form action={reviewGuardian} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="check_id" value={c.id} />
                  <div className="field">
                    <label className="label" htmlFor={`n-${c.id}`}>Note</label>
                    <input id={`n-${c.id}`} name="note" className="input w-64" />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor={`m-${c.id}`}>Minutes</label>
                    <input id={`m-${c.id}`} name="minutes" className="input mono w-24" inputMode="numeric" required />
                  </div>
                  <button className="btn2" type="submit" name="decision" value="pass">Pass</button>
                  <button className="btn3" type="submit" name="decision" value="fail">Not passed</button>
                </form>
              ) : null}
            </div>
          ))
        ) : (
          <p className="help">None waiting.</p>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="dr-h">
        <h2 id="dr-h" className="t3">Data requests</h2>
        {requests.length ? (
          <ul className="card flex flex-col divide-y divide-dashed divide-line-2 p-0!">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <span>
                  {r.kind === "export" ? "Export" : "Erasure"} · {r.profile?.display_name ?? "User"} · <span className="mono">{formatDate(r.created_at)}</span> · {r.status}
                </span>
                {admin && r.kind === "erasure" && ["requested", "in_progress"].includes(r.status) ? (
                  <form action={closeDataRequest} className="flex items-center gap-2">
                    <input type="hidden" name="request_id" value={r.id} />
                    <label className="sr-only" htmlFor={`dn-${r.id}`}>Note</label>
                    <input id={`dn-${r.id}`} name="note" className="input w-48" placeholder="Note to the person" />
                    <select name="status" className="input w-36" defaultValue="in_progress" aria-label="Status">
                      <option value="in_progress">In progress</option>
                      <option value="completed">Completed</option>
                      <option value="rejected">Not possible</option>
                    </select>
                    <button className="btn3" type="submit">Save</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="help">No requests.</p>
        )}
        <p className="help">To complete an erasure, remove names, contacts and children’s details; keep payment and tax records for the period the law requires.</p>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="g-h">
        <h2 id="g-h" className="t3">Parents</h2>
        {guardians.length ? (
          <div className="overflow-x-auto">
            <table className="table-k min-w-[700px]">
              <thead>
                <tr>
                  <th scope="col">Parent</th>
                  <th scope="col">ID check</th>
                  <th scope="col">Children</th>
                  <th scope="col">Joined</th>
                </tr>
              </thead>
              <tbody>
                {guardians.map((g) => (
                  <tr key={g.id}>
                    <td>{g.display_name ?? "—"}</td>
                    <td>{g.identity_check_status}</td>
                    <td>{g.learners.map((l) => `${l.alias} (${l.year_of_birth ?? "?"}, consent ${l.consent_status})`).join(", ") || "—"}</td>
                    <td className="mono">{formatDate(g.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="help">No parent accounts yet.</p>
        )}
      </section>
    </div>
  );
}
