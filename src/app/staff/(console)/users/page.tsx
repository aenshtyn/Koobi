import type { Metadata } from "next";
import { Guarded } from "@/components/app/shell";
import { getStaff } from "@/lib/data/staff-admin";
import { setRole } from "../admin-actions";

export const metadata: Metadata = { title: "Staff and roles", robots: { index: false } };

const ROLES = ["concierge", "reviewer", "finance", "admin"] as const;
const LABEL: Record<string, string> = { concierge: "Concierge", reviewer: "Reviewer", finance: "Finance", admin: "Admin" };

/** S23: concierge, reviewer, finance, admin. Granted by an admin only; every change is audited. */
export default function UsersPage(props: PageProps<"/staff/users">) {
  return (
    <Guarded next="/staff/users" anyOf={["admin"]}>
      <Users searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Users({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, staff] = await Promise.all([searchParams, getStaff()]);
  return (
    <div className="flex max-w-[900px] flex-col gap-6">
      <h1 className="t1">Staff and roles</h1>
      {typeof sp.done === "string" ? <p className="panel escrow" role="status">{sp.done}</p> : null}
      {typeof sp.error === "string" ? <p className="panel error" role="alert">{sp.error}</p> : null}
      <form action={setRole} className="card flex flex-wrap items-end gap-3 p-5">
        <input type="hidden" name="grant" value="true" />
        <div className="field min-w-60 flex-1">
          <label className="label" htmlFor="lookup">Phone or email of someone who has signed in</label>
          <input id="lookup" name="lookup" className="input mono" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="role">Role</label>
          <select id="role" name="role" className="input w-40" defaultValue="concierge">
            {ROLES.map((r) => <option key={r} value={r}>{LABEL[r]}</option>)}
          </select>
        </div>
        <button className="btn2" type="submit">Grant</button>
      </form>
      <div className="overflow-x-auto">
        <table className="table-k min-w-[720px]">
          <thead><tr><th scope="col">Name</th><th scope="col">Contact</th><th scope="col">Roles</th></tr></thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.user_id}>
                <td>{s.name}</td>
                <td className="mono text-[13px]">{s.contact}</td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    {s.roles.map((r) => (
                      <form key={r} action={setRole}>
                        <input type="hidden" name="user_id" value={s.user_id} />
                        <input type="hidden" name="role" value={r} />
                        <input type="hidden" name="grant" value="false" />
                        <button className="chip sm" type="submit" title="Remove this role">{LABEL[r] ?? r} ×</button>
                      </form>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="help">Staff sign in with their phone and an authenticator app; the second step is required on every staff screen.</p>
    </div>
  );
}
