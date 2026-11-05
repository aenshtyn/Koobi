import type { Metadata } from "next";
import { Guarded } from "@/components/app/shell";
import { getTeacherDirectory } from "@/lib/data/verification";
import { setWaitlist } from "../teachers/actions";

export const metadata: Metadata = { title: "Waitlist", robots: { index: false } };

const TRACKS: Record<string, string> = { school: "School", adults_professional: "Adults and professionals", practical: "Practical skills" };

/** S8: founding members per track (FR-OFF-5). Released automatically on the track's marketing start date. */
export default function WaitlistPage(props: PageProps<"/staff/waitlist">) {
  return (
    <Guarded next="/staff/waitlist" anyOf={["concierge", "admin"]}>
      <Waitlist searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Waitlist({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, teachers] = await Promise.all([searchParams, getTeacherDirectory()]);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="t1">Founding-member waitlist</h1>
      {typeof sp.done === "string" ? <p className="panel escrow" role="status">{sp.done}</p> : null}
      {typeof sp.error === "string" ? <p className="panel error" role="alert">{sp.error}</p> : null}
      <p className="help">Waitlisted teachers are hidden on that track until it opens. Each track opens on its marketing start date, or when you release someone here.</p>
      {Object.entries(TRACKS).map(([code, label]) => {
        const rows = teachers.flatMap((t) => t.tracks.filter((x) => x.track === code).map((x) => ({ t, x })));
        return (
          <section key={code} className="flex flex-col gap-2" aria-labelledby={`h-${code}`}>
            <h2 id={`h-${code}`} className="t3">
              {label} <span className="help mono">{rows.filter((r) => r.x.waitlist_status === "waitlisted").length} waiting</span>
            </h2>
            {rows.length ? (
              <ul className="card flex flex-col divide-y divide-dashed divide-line-2 p-0!">
                {rows.map(({ t, x }) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <span>
                      {t.display_name} <span className="help">· level {x.tier}</span>
                    </span>
                    <form action={setWaitlist} className="flex items-center gap-2">
                      <input type="hidden" name="teacher_id" value={t.id} />
                      <input type="hidden" name="track" value={code} />
                      {x.waitlist_status === "waitlisted" ? (
                        <button className="btn3" type="submit" name="to" value="released">Release now</button>
                      ) : x.waitlist_status === "none" ? (
                        <button className="btn3" type="submit" name="to" value="waitlisted">Add to waitlist</button>
                      ) : (
                        <span className="help">Released</span>
                      )}
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="help">Nobody on this track yet.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
