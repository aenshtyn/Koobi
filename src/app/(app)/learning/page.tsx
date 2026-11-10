import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, UserRound } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { getExperiences, type Experience } from "@/lib/data/learning";
import { EXPERIENCE_LABELS, EXPERIENCE_TONE, FORMAT_PLURALS, percent, type ExperienceState } from "@/domain/learning";
import { formatDate, formatTime } from "@/domain/format";
import { FORMATS, isFormatCode } from "@/domain/taxonomy";

export const metadata: Metadata = { title: "My Learning" };

const STATES: [ExperienceState | "all", string][] = [
  ["all", "All"],
  ["in_progress", "In progress"],
  ["upcoming", "Upcoming"],
  ["completed", "Completed"],
];
const OPEN: Record<string, string> = { one_to_one: "Continue learning", small_group: "View class details", workshop: "View workshop details", cohort: "View programme schedule", site_visit: "View details" };

/** My Learning: one card per learning experience, with how far along the learner is. */
export default function LearningPage(props: PageProps<"/learning">) {
  return (
    <Guarded next="/learning">
      <Learning searchParams={props.searchParams} />
    </Guarded>
  );
}

/** "2 of 6 sessions" with a bar when the total is known; otherwise the count of lessons done. */
function Progress({ e }: { e: Experience }) {
  const unit = e.format === "one_to_one" ? "lesson" : "session";
  if (e.total) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3 text-[14px] leading-5">
          <span className="font-semibold">Progress</span>
          <span>
            <span className="mono">{e.done}</span> of <span className="mono">{e.total}</span> {unit}s
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-sand" role="progressbar" aria-valuemin={0} aria-valuemax={e.total} aria-valuenow={e.done} aria-label={`${e.done} of ${e.total} ${unit}s done`}>
          <div className="h-full rounded-full bg-forest" style={{ width: `${percent(e.done, e.total)}%` }} />
        </div>
      </div>
    );
  }
  return (
    <p className="text-[14px] leading-5 text-ink-2">
      <span className="mono text-ink">{e.done}</span> {unit}
      {e.done === 1 ? "" : "s"} done
    </p>
  );
}

function Card({ e }: { e: Experience }) {
  return (
    <li className="card flex flex-col gap-3.5 p-5">
      <div className="flex items-start gap-3.5">
        <span className="flex h-14 w-14 flex-none items-center justify-center rounded-[14px] bg-fmt-1 text-orange-deep" aria-hidden="true">
          <BookOpen size={24} />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className={`pill self-start ${EXPERIENCE_TONE[e.state]}`}>{EXPERIENCE_LABELS[e.state]}</span>
          <h2 className="t3">{e.title}</h2>
          <span className="flex items-center gap-1.5 text-[15px] text-ink-2">
            <UserRound size={15} aria-hidden="true" className="flex-none" />
            {e.teacher_name} · {FORMATS[e.format].label}
            {e.learners.length > 1 ? ` · for ${e.learners.join(" and ")}` : ""}
          </span>
        </div>
      </div>
      <Progress e={e} />
      <p className="flex items-center gap-2 text-[15px]">
        <CalendarDays size={16} aria-hidden="true" className="flex-none text-ink-2" />
        {e.next ? (
          <span>
            Next {e.format === "one_to_one" ? "session" : e.format === "small_group" ? "class" : "session"}:{" "}
            <span className="mono">
              {formatDate(e.next.at)} · {formatTime(e.next.at)}
            </span>
          </span>
        ) : (
          <span className="text-ink-2">{e.state === "completed" ? "Nothing more booked." : "No session booked yet."}</span>
        )}
      </p>
      <Link className="btn2 mt-auto" href={`/learning/${e.offering_id}`}>
        {e.state === "completed" ? "View details" : OPEN[e.format]} <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </li>
  );
}

async function Learning({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, { experiences }] = await Promise.all([searchParams, getExperiences()]);
  const format = typeof sp.format === "string" && isFormatCode(sp.format) ? sp.format : null;
  const state = STATES.some(([k]) => k === sp.state) ? (sp.state as ExperienceState | "all") : "all";
  const shown = experiences.filter((e) => (!format || e.format === format) && (state === "all" || e.state === state));
  const href = (f: string | null, s: string) => {
    const p = new URLSearchParams({ ...(f ? { format: f } : {}), ...(s !== "all" ? { state: s } : {}) });
    return `/learning${p.size ? `?${p}` : ""}`;
  };
  return (
    <div className="flex max-w-[1080px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="t1">My Learning</h1>
        <p className="text-ink-2">Manage your learning experiences and track your progress.</p>
      </div>
      <div className="flex flex-col gap-3">
        <nav className="flex flex-wrap items-center gap-2" aria-label="Filter by learning format">
          <Link className={`chip sm${!format ? " on" : ""}`} href={href(null, state)} aria-current={!format ? "true" : undefined}>
            All learning
          </Link>
          {FORMAT_PLURALS.map(([f, label]) => (
            <Link key={f} className={`chip sm${format === f ? " on" : ""}`} href={href(f, state)} aria-current={format === f ? "true" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <nav className="flex flex-wrap items-center gap-2" aria-label="Filter by progress">
          {STATES.map(([k, label]) => (
            <Link key={k} className={`chip sm${state === k ? " on" : ""}`} href={href(format, k)} aria-current={state === k ? "true" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
      {shown.length ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {shown.map((e) => (
            <Card key={e.offering_id} e={e} />
          ))}
        </ul>
      ) : (
        <div className="empty">
          <BookOpen size={24} aria-hidden="true" />
          <p className="font-semibold">{experiences.length ? "Nothing matches these filters." : "You have not started learning yet."}</p>
          <p className="help">{experiences.length ? "Try another filter. Completed experiences stay under Completed." : "Book a session, class, workshop or programme and it shows here with your progress."}</p>
          {experiences.length ? (
            <Link className="btn3" href="/learning">
              Show everything
            </Link>
          ) : (
            <Link className="btn2" href="/explore">
              Explore learning experiences
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
