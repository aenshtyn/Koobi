import type { Metadata } from "next";
import Link from "next/link";
import { Guarded } from "@/components/app/shell";
import { ListingPill } from "@/components/app/listing-pill";
import type { ListingState } from "@/domain/listing";
import { getSessionUser } from "@/lib/auth";
import { getTeacherDirectory } from "@/lib/data/verification";
import { formatDate } from "@/domain/format";
import { setTeacherStatus } from "./actions";

export const metadata: Metadata = { title: "Teachers and experts", robots: { index: false } };

const STATUS: Record<string, string> = { applied: "Applied", bookable: "Bookable", suspended: "Suspended", offboarded: "Offboarded" };
const TRACKS: Record<string, string> = { school: "School", adults_professional: "Adults", practical: "Practical" };

/** S18: directory, suspend, reinstate, offboard. Status changes are admin-only in the database. */
export default function TeachersPage(props: PageProps<"/staff/teachers">) {
  return (
    <Guarded next="/staff/teachers" anyOf={["concierge", "reviewer", "finance", "admin"]}>
      <Directory searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Directory({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, teachers, user] = await Promise.all([searchParams, getTeacherDirectory(), getSessionUser()]);
  const admin = !!user?.roles.includes("admin");
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const rows = q ? teachers.filter((t) => t.display_name.toLowerCase().includes(q) || t.slug.includes(q)) : teachers;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="t1">Teachers and experts</h1>
      {typeof sp.done === "string" ? <p className="panel escrow" role="status">{sp.done}</p> : null}
      {typeof sp.error === "string" ? <p className="panel error" role="alert">{sp.error}</p> : null}
      <form className="flex max-w-md gap-2" role="search">
        <label className="sr-only" htmlFor="q">Search by name</label>
        <input id="q" name="q" className="input" defaultValue={q} placeholder="Search by name" />
        <button className="btn2" type="submit">Search</button>
      </form>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="table-k min-w-[1000px]">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Profile</th>
                <th scope="col">Account</th>
                <th scope="col">Levels</th>
                <th scope="col">Ready to be paid</th>
                {admin ? <th scope="col"><span className="sr-only">Action</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link className="font-semibold" href={`/teachers/${t.slug}`}>{t.display_name}</Link>
                    <p className="help mono">{formatDate(t.created_at)}</p>
                  </td>
                  <td><ListingPill state={t.listing_status as ListingState} /></td>
                  <td>
                    {STATUS[t.status] ?? t.status}
                    {t.status_reason ? <p className="help">{t.status_reason}</p> : null}
                  </td>
                  <td>
                    {t.tracks.length
                      ? t.tracks.map((x) => (
                          <span key={x.track} className="mr-2 inline-block">
                            {TRACKS[x.track] ?? x.track} <span className="mono">{x.tier}</span>
                            {x.waitlist_status === "waitlisted" ? <span className="help"> (waitlist)</span> : null}
                          </span>
                        ))
                      : "—"}
                  </td>
                  <td>
                    {t.has_kra ? "KRA PIN" : <span className="text-error">No KRA PIN</span>} ·{" "}
                    {t.payout_ownership_status === "passed" ? "number proven" : <span className="text-error">number {t.payout_ownership_status}</span>}
                  </td>
                  {admin ? (
                    <td>
                      {t.status !== "offboarded" ? (
                        <form action={setTeacherStatus} className="flex items-center gap-2">
                          <input type="hidden" name="teacher_id" value={t.id} />
                          <label className="sr-only" htmlFor={`s-${t.id}`}>Action</label>
                          <select id={`s-${t.id}`} name="status" className="input w-36" defaultValue="">
                            <option value="" disabled>Choose</option>
                            {t.status === "suspended" ? <option value="applied">Reinstate</option> : <option value="suspended">Suspend</option>}
                            <option value="offboarded">Offboard</option>
                          </select>
                          <label className="sr-only" htmlFor={`why-${t.id}`}>Reason</label>
                          <input id={`why-${t.id}`} name="reason" className="input w-40" placeholder="Reason" required minLength={5} />
                          <button className="btn3" type="submit">Apply</button>
                        </form>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No teachers found.</p>
      )}
    </div>
  );
}
