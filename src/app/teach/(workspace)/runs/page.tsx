import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CalendarPlus } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { getMyOffers, getMyTeacher } from "@/lib/data/listings";
import { getMyRuns } from "@/lib/data/runs";
import { TIME_OPTIONS, dayKey } from "@/domain/schedule";
import { isGroup } from "@/domain/listing-input";
import { FORMATS, type FormatCode } from "@/domain/taxonomy";
import { AddDatesForm } from "./forms";
import { RunCard } from "./run-card";

export const metadata: Metadata = { title: "Group dates" };

const DONE: Record<string, string> = { removed: "Those draft dates were removed." };

/** T13: the dates of every group class, workshop and programme, and a form to add more. */
export default function RunsPage(props: PageProps<"/teach/runs">) {
  return (
    <Guarded next="/teach/runs">
      <Runs searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Runs({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, teacher] = await Promise.all([searchParams, getMyTeacher()]);
  const [{ runs, ready }, offers] = await Promise.all([getMyRuns(), teacher ? getMyOffers(teacher.id) : []]);
  const groups = offers.filter((o) => isGroup(o.format) && !["retired", "paused"].includes(o.listing_status));
  const only = typeof sp.experience === "string" ? sp.experience : "";
  const shown = only ? runs.filter((r) => r.offering_id === only) : runs;
  const live = shown.filter((r) => ["draft", "open", "confirmed", "in_progress"].includes(r.status));
  const past = shown.filter((r) => ["completed", "cancelled"].includes(r.status));
  const now = new Date();
  const done = typeof sp.done === "string" ? DONE[sp.done] : undefined;
  return (
    <div className="flex max-w-[1180px] flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="t1">Group dates</h1>
        <p className="text-ink-2">Dates for your group classes, workshops and programmes. Learners book a seat on a date; you see who is coming.</p>
      </div>
      {done ? (
        <p className="panel info" role="status">
          {done}
        </p>
      ) : null}
      {!ready ? <p className="panel info">Group dates need the latest database update. Until it is applied, nothing can be added here.</p> : null}

      <section className="card flex flex-col gap-4 p-5" aria-labelledby="add-h">
        <h2 id="add-h" className="t3 flex items-center gap-2">
          <CalendarPlus size={20} aria-hidden="true" />
          Add dates
        </h2>
        {groups.length ? (
          <AddDatesForm
            offers={groups.map((o) => ({ id: o.id, label: `${o.title} · ${FORMATS[o.format as FormatCode]?.label ?? o.format}` }))}
            picked={groups.some((o) => o.id === only) ? only : undefined}
            minDate={dayKey(new Date(now.getTime() + 2 * 86_400_000))}
            times={TIME_OPTIONS}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-ink-2">Create a group class, workshop or programme first. Then add its dates here.</p>
            <Link className="btn2 self-start" href="/teach/offers/new">
              Create learning experience
            </Link>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="live-h">
        <h2 id="live-h" className="t2">
          Coming up <span className="mono text-ink-2">({live.length})</span>
        </h2>
        {live.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[...live].reverse().map((r) => (
              <RunCard key={r.id} r={r} />
            ))}
          </ul>
        ) : (
          <div className="empty">
            <CalendarDays size={24} aria-hidden="true" />
            <p className="font-semibold">No dates coming up.</p>
            <p className="help">Add the first session above; a class or programme then repeats weekly.</p>
          </div>
        )}
      </section>

      {past.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="past-h">
          <h2 id="past-h" className="t2">
            Finished <span className="mono text-ink-2">({past.length})</span>
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {past.map((r) => (
              <RunCard key={r.id} r={r} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
