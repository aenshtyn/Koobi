import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, CalendarClock, Check, Video } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { APPLICATION_STATUS, CREDENTIAL_KINDS, CREDENTIAL_STATUS, WORKFLOW, workflowProgress } from "@/domain/expert";
import { formatDate, formatTime, formatWeekday } from "@/domain/format";
import { getCredentials, getMyApplication } from "@/lib/data/expert";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Application status" };

export default function StatusPage(props: PageProps<"/teach/apply/status">) {
  return (
    <Guarded next="/teach/apply/status">
      <Suspense fallback={null}>
        <Sent searchParams={props.searchParams} />
      </Suspense>
      <Status />
    </Guarded>
  );
}

async function Sent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { sent } = await searchParams;
  if (!sent) return null;
  return (
    <div className="panel escrow mb-6 max-w-[860px] items-center" role="status">
      <span className="seal" aria-hidden="true" />
      <p>
        <b>Application submitted.</b> We have emailed you a confirmation and will write to you at each step.
      </p>
    </div>
  );
}

async function Status() {
  const { ready, app } = await getMyApplication();
  if (!ready || !app || app.application_status === "draft" || app.application_status === "more_info") redirect("/teach/apply");
  const docs = await getCredentials(app.id);
  const st = APPLICATION_STATUS[app.application_status];
  const done = workflowProgress(app);
  const rejected = app.application_status === "rejected";
  const approved = app.application_status === "approved";
  const meetingOpen = app.application_status === "meeting_required" && app.meeting_at && !app.meeting_held_at;

  return (
    <div className="flex max-w-[860px] flex-col gap-7">
      <div className="flex flex-col gap-3">
        <h1 className="t1">Your Application</h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`pill ${st.tone}`}>{st.label}</span>
          {app.application_submitted_at ? (
            <span className="help">
              Submitted <span className="mono">{formatDate(app.application_submitted_at)}</span>
            </span>
          ) : null}
        </div>
      </div>

      {approved ? (
        <div className="panel escrow flex-wrap items-center" role="status">
          <span className="seal" aria-hidden="true" />
          <p className="flex-1">
            <b>You are approved.</b> Your expert dashboard is open. Nothing is public yet: your profile and each learning experience are reviewed before learners see them.
          </p>
          <Link className="btn" href="/teach">
            Open your dashboard <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      ) : null}
      {rejected ? (
        <div className="panel error flex-col! items-start!" role="alert">
          <p className="font-semibold">We are not able to approve your application.</p>
          {app.application_note ? <p className="whitespace-pre-line">{app.application_note}</p> : null}
          <p>
            Questions? Write to <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.
          </p>
        </div>
      ) : null}
      {meetingOpen ? (
        <section className="card flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="meet-h">
          <h2 id="meet-h" className="t2 flex items-center gap-2.5">
            <CalendarClock size={22} aria-hidden="true" className="text-orange" />
            Your 15-minute meeting
          </h2>
          <p>
            <span className="mono text-[19px]">
              {formatWeekday(app.meeting_at!)}, {formatTime(app.meeting_at!)}
            </span>{" "}
            <span className="text-ink-2">Nairobi time (EAT)</span>
          </p>
          <p className="text-ink-2">We talk about your experience, your areas of expertise and how you work with learners. If the time does not suit you, reply to the invitation email.</p>
          {app.meeting_link ? (
            <a className="btn self-start" href={app.meeting_link} target="_blank" rel="noreferrer">
              <Video size={18} aria-hidden="true" />
              Join the meeting
            </a>
          ) : null}
        </section>
      ) : null}
      {app.application_status === "meeting_required" && app.meeting_held_at ? (
        <p className="panel info" role="status">
          Thank you for meeting us. We are making the final decision and will email you.
        </p>
      ) : null}

      <section className="card p-5 sm:p-6" aria-labelledby="steps-h">
        <h2 id="steps-h" className="t2 mb-4">
          Where your application stands
        </h2>
        <ol className="flex flex-col">
          {WORKFLOW.map((w, i) => {
            const isDone = i < done && !(rejected && i === 5);
            const now = i === done && !rejected && !approved;
            return (
              <li key={w.key} className="flex items-start gap-4 border-b border-dashed border-line-2 py-3.5 last:border-0" aria-current={now ? "step" : undefined}>
                <span
                  className={`flex h-9 w-9 flex-none items-center justify-center rounded-full border-[1.5px] text-[15px] font-semibold ${
                    isDone ? "border-forest bg-forest text-white" : now ? "border-ink bg-ink text-white" : "border-line-2 bg-card text-ink-2"
                  }`}
                >
                  {isDone ? <Check size={18} aria-label="Done" /> : i + 1}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="t3">
                    {w.title}
                    {now ? <span className="ml-2 text-[14px] font-normal text-ink-2">In progress</span> : null}
                  </span>
                  <span className="help">{w.text}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="card p-5 sm:p-6" aria-labelledby="docs-h">
        <h2 id="docs-h" className="t2 mb-2">
          Your documents
        </h2>
        <ul className="flex flex-col">
          {docs.map((d) => {
            const s = CREDENTIAL_STATUS[d.status];
            return (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-line-2 py-2.5 last:border-0">
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{d.title}</span>
                  <span className="help">
                    {CREDENTIAL_KINDS[d.kind]}
                    {d.status === "rejected" && d.note ? ` · ${d.note}` : ""}
                  </span>
                </span>
                <span className={`pill ${s.tone}`}>{s.label}</span>
              </li>
            );
          })}
        </ul>
        <p className="help mt-3">Each document is verified on its own. Only verified qualifications ever appear on a public profile; your ID never does.</p>
      </section>
    </div>
  );
}
