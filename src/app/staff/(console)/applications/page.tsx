import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { APPLICATION_STATUS, categoryLabel, countryLabel } from "@/domain/expert";
import { formatDate, formatTime } from "@/domain/format";
import { STAFF_ROLES } from "@/lib/auth";
import { APPLICATION_VIEWS, getApplications, type ApplicationView } from "@/lib/data/expert";

export const metadata: Metadata = { title: "Expert applications", robots: { index: false } };

const VIEWS: [ApplicationView, string][] = [
  ["new", "Submitted"],
  ["verification", "Under verification"],
  ["meeting", "Meeting required"],
  ["returned", "Returned"],
  ["decided", "Decided"],
];
const EMPTY: Record<ApplicationView, string> = {
  new: "No new applications.",
  verification: "No applications are being verified.",
  meeting: "No meetings are open.",
  returned: "No applications are back with their applicant.",
  decided: "No decisions yet.",
};

export default function ApplicationsPage(props: PageProps<"/staff/applications">) {
  return (
    <Guarded next="/staff/applications" anyOf={STAFF_ROLES}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="t1">Expert applications</h1>
          <p className="text-ink-2">Submitted, then documents verified, then a 15-minute meeting, then the decision. Approval opens the expert&rsquo;s dashboard and publishes nothing.</p>
        </div>
        <Queue searchParams={props.searchParams} />
      </div>
    </Guarded>
  );
}

async function Queue({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const view = (typeof sp.view === "string" && sp.view in APPLICATION_VIEWS ? sp.view : "new") as ApplicationView;
  const { ready, rows, counts } = await getApplications(view);
  if (!ready) return <p className="panel info">Expert applications are being switched on: the database migration has not been applied here yet.</p>;
  return (
    <>
      <nav className="flex flex-wrap gap-2" aria-label="Application stages">
        {VIEWS.map(([v, label]) => (
          <Link key={v} href={`/staff/applications?view=${v}`} className={`chip ${v === view ? "on" : ""}`} aria-current={v === view ? "page" : undefined}>
            {label} <span className="mono">{counts[v]}</span>
          </Link>
        ))}
      </nav>
      {rows.length ? (
        <ul className="flex flex-col gap-3">
          {rows.map((a) => {
            const st = APPLICATION_STATUS[a.application_status];
            return (
              <li key={a.id}>
                <Link href={`/staff/applications/${a.id}`} className="card flex flex-wrap items-center gap-x-5 gap-y-2 p-4 text-ink no-underline hover:bg-orange-wash sm:px-5">
                  <span className="flex min-w-0 flex-[1_1_260px] flex-col">
                    <span className="t3">{a.display_name}</span>
                    <span className="help truncate">
                      {[a.headline, categoryLabel(a.primary_category), [a.city, countryLabel(a.country_code)].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="flex flex-col text-[14px] text-ink-2">
                    {a.application_submitted_at ? (
                      <span>
                        Submitted <span className="mono">{formatDate(a.application_submitted_at)}</span>
                      </span>
                    ) : null}
                    {a.application_status === "meeting_required" && a.meeting_at ? (
                      <span>
                        {a.meeting_held_at ? "Meeting held, decision due" : "Meeting"} <span className="mono">{formatDate(a.meeting_at)} {formatTime(a.meeting_at)}</span>
                      </span>
                    ) : null}
                  </span>
                  <span className={`pill ${st.tone}`}>{st.label}</span>
                  <ArrowRight size={18} aria-hidden="true" className="text-ink-2" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="help">{EMPTY[view]}</p>
      )}
    </>
  );
}
