import Link from "next/link";
import { ArrowRight, CalendarDays, Clock, Users } from "lucide-react";
import { RUN_LABELS, RUN_TONE, type MyRun } from "@/lib/data/runs";
import { formatKES, formatTime, formatWeekday } from "@/domain/format";
import { FORMATS, type FormatCode } from "@/domain/taxonomy";

/** One group on a card: when it meets, how many seats are taken, and the way in to its participants. */
export function RunCard({ r }: { r: MyRun }) {
  const paid = r.seats.filter((s) => !["cancelled", "lapsed"].includes(s.status));
  return (
    <li className="card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`pill ${RUN_TONE[r.status]}`}>{RUN_LABELS[r.status]}</span>
        <span className="pill">{FORMATS[r.format as FormatCode]?.label ?? r.format}</span>
      </div>
      <span className="t3">{r.title}</span>
      <div className="flex flex-col gap-1.5 text-[15px]">
        <span className="flex items-center gap-2">
          <CalendarDays size={16} aria-hidden="true" className="flex-none text-ink-2" />
          <span>
            {r.sessions.length > 1 ? "Starts " : ""}
            <span className="mono">{formatWeekday(r.starts_at)}</span>, <span className="mono">{formatTime(r.starts_at)}</span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          <Clock size={16} aria-hidden="true" className="flex-none text-ink-2" />
          <span>
            <span className="mono">{r.sessions.length}</span> {r.sessions.length === 1 ? "session" : "weekly sessions"} · <span className="mono">{formatKES(r.price_kes)}</span> a learner
          </span>
        </span>
        <span className="flex items-center gap-2">
          <Users size={16} aria-hidden="true" className="flex-none text-ink-2" />
          <span>
            <span className="mono">
              {paid.length} of {r.capacity_max}
            </span>{" "}
            seats taken
            {paid.length ? (
              <>
                {" "}
                · <span className="mono">{formatKES(paid.reduce((n, s) => n + s.price_kes, 0))}</span> paid
              </>
            ) : null}
          </span>
        </span>
      </div>
      <Link className="btn2 mt-auto justify-center" href={`/teach/runs/${r.id}`}>
        {paid.length ? "View participants" : "Open these dates"} <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </li>
  );
}

