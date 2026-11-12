import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import {
  APPLICATION_STATUS,
  CREDENTIAL_KINDS,
  CREDENTIAL_STATUS,
  FORMAT_LABELS,
  audienceLabel,
  categoryLabel,
  countryLabel,
  educationLabel,
  experienceLabel,
  languageLabel,
  wordCount,
} from "@/domain/expert";
import { formatDate, formatTime, formatWeekday } from "@/domain/format";
import { EMPLOYMENT } from "@/domain/listing-input";
import { STAFF_ROLES, getSessionUser } from "@/lib/auth";
import { getApplicationDetail } from "@/lib/data/expert";
import { startVerification } from "../actions";
import { DecisionForm, DocumentDecision, InviteForm, MeetingForm } from "../forms";

export const metadata: Metadata = { title: "Application", robots: { index: false } };

const DONE: Record<string, string> = {
  started: "Verification started. The applicant has been told.",
  document: "Saved.",
  invited: "Invitation sent by email.",
  recorded: "Meeting outcome recorded.",
  approve: "Approved. The confirmation email is on its way and the dashboard is open.",
  reject: "Rejected. The applicant has been told, with your reason.",
  more_info: "Returned to the applicant with your note.",
};
const EVENTS: Record<string, string> = {
  submitted: "Application submitted",
  resubmitted: "Submitted again",
  under_verification: "Verification started",
  meeting_invited: "Meeting invitation sent",
  meeting_recorded: "Meeting outcome recorded",
  approved: "Approved",
  rejected: "Rejected",
  more_info: "Returned for more information",
  profile_published: "Profile published",
};
const OUTCOMES: Record<string, string> = { suitable: "Suitable", not_suitable: "Not suitable", unsure: "Not sure yet" };

export default function ApplicationPage(props: PageProps<"/staff/applications/[id]">) {
  return (
    <Guarded next="/staff/applications" anyOf={STAFF_ROLES}>
      <Detail params={props.params} searchParams={props.searchParams} />
    </Guarded>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="help">{label}</dt>
      <dd className="break-words">{children || "—"}</dd>
    </div>
  );
}

async function Detail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, getSessionUser()]);
  const found = await getApplicationDetail(id);
  if (!found || found.app.application_status === "draft") notFound();
  const { app, email, credentials, review, events } = found;
  const canDecide = !!user?.roles.some((r) => r === "reviewer" || r === "admin");
  const isAdmin = !!user?.roles.includes("admin");
  const st = APPLICATION_STATUS[app.application_status];
  const s = app.application_status;
  const identity = credentials.filter((c) => c.kind === "identity");
  const idVerified = identity.some((c) => c.status === "approved");
  const open = s === "submitted" || s === "under_verification" || s === "meeting_required";
  const blockers = [!idVerified ? "verify the identity document" : null, s !== "meeting_required" ? "invite the expert to the meeting" : !app.meeting_held_at ? "record the meeting outcome" : null].filter(Boolean) as string[];
  const here = `/staff/applications/${app.id}`;

  return (
    <div className="flex max-w-[900px] flex-col gap-6">
      <Link className="btn3 self-start" href="/staff/applications">
        <ArrowLeft size={16} aria-hidden="true" />
        Expert applications
      </Link>
      {typeof sp.done === "string" && DONE[sp.done] ? (
        <div className="panel escrow items-center" role="status">
          <span className="seal" aria-hidden="true" />
          <p>{DONE[sp.done]}</p>
        </div>
      ) : null}
      {typeof sp.error === "string" ? <p className="panel error">{sp.error}</p> : null}

      <div className="flex flex-wrap items-start gap-5">
        {app.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- the applicant's own photo, from our storage
          <img src={app.photo_url} alt={`Photo of ${app.display_name}`} className="h-[104px] w-[104px] flex-none rounded-[16px] border-[1.5px] border-ink object-cover" />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h1 className="t1">{app.display_name}</h1>
          <p className="text-ink-2">{app.headline}</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`pill ${st.tone}`}>{st.label}</span>
            {app.application_submitted_at ? (
              <span className="help">
                Submitted <span className="mono">{formatDate(app.application_submitted_at)}</span>
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {!canDecide ? <p className="panel info">You can read this application. Verifying documents and deciding needs the reviewer or admin role.</p> : null}
      {s === "more_info" || s === "rejected" ? (
        <p className="panel">
          <b>{s === "rejected" ? "Reason given:" : "Asked for:"}</b> {app.application_note}
        </p>
      ) : null}

      {s === "submitted" && canDecide ? (
        <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="min-w-0 flex-1">Pick this application up to start checking the documents. The applicant sees &ldquo;Under verification&rdquo;.</p>
          <form action={startVerification}>
            <input type="hidden" name="teacher_id" value={app.id} />
            <button className="btn" type="submit">
              Start verification
            </button>
          </form>
        </section>
      ) : null}

      <section className="card flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="docs-h">
        <div className="flex flex-col gap-1">
          <h2 id="docs-h" className="t2">
            Documents
          </h2>
          <p className="help">Each is verified on its own. Opening a document is logged. Only verified qualifications ever show publicly; the ID never does.</p>
        </div>
        <ul className="flex flex-col">
          {credentials.map((c) => {
            const cs = CREDENTIAL_STATUS[c.status];
            return (
              <li key={c.id} className="flex flex-col gap-3 border-b border-dashed border-line-2 py-4 first:pt-0 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="flex min-w-0 flex-[1_1_240px] flex-col">
                    <span className="font-semibold">{c.title}</span>
                    <span className="help">
                      {CREDENTIAL_KINDS[c.kind]}
                      {c.issuer ? ` · ${c.issuer}` : ""} · uploaded <span className="mono">{formatDate(c.created_at)}</span>
                    </span>
                  </span>
                  <span className={`pill ${cs.tone}`}>{cs.label}</span>
                  {canDecide ? (
                    <a className="btn3" href={`/staff/applications/document?id=${c.id}`} target="_blank" rel="noreferrer">
                      Open (logged) <ExternalLink size={15} aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
                {c.status === "rejected" && c.note ? <p className="help">Reason: {c.note}</p> : null}
                {canDecide && c.status === "submitted" && s !== "submitted" ? <DocumentDecision id={c.id} back={here} /> : null}
              </li>
            );
          })}
        </ul>
        {s === "submitted" ? <p className="help">Start verification to record a result for each document.</p> : null}
        {app.portfolio_links.length || app.website_url ? (
          <div className="flex flex-col gap-1 border-t border-dashed border-line-2 pt-4">
            <span className="help">Portfolio and supporting links</span>
            {[app.website_url, ...app.portfolio_links].filter(Boolean).map((l) => (
              <a key={l} href={l!} target="_blank" rel="noreferrer nofollow" className="break-all">
                {l}
              </a>
            ))}
          </div>
        ) : null}
      </section>

      {(s === "under_verification" || s === "meeting_required") && canDecide ? (
        <section className="card flex flex-col gap-5 p-5 sm:p-6" aria-labelledby="meet-h">
          <h2 id="meet-h" className="t2">
            15-minute meeting
          </h2>
          {app.meeting_at ? (
            <p>
              Invited for{" "}
              <span className="mono">
                {formatWeekday(app.meeting_at)}, {formatTime(app.meeting_at)}
              </span>{" "}
              (Nairobi) ·{" "}
              <a href={app.meeting_link ?? "#"} target="_blank" rel="noreferrer">
                meeting link
              </a>
            </p>
          ) : null}
          {review?.recorded_at ? (
            <div className="panel flex-col! items-start!">
              <p>
                <b>Outcome: {OUTCOMES[review.meeting_outcome ?? ""] ?? review.meeting_outcome}</b> · recorded <span className="mono">{formatDate(review.recorded_at)}</span>
              </p>
              <p className="whitespace-pre-line">{review.meeting_notes}</p>
            </div>
          ) : null}
          {!idVerified ? <p className="help">Verify the identity document first. The invitation goes out only once the documents are in order.</p> : null}
          {idVerified && !app.meeting_held_at ? <InviteForm teacherId={app.id} again={!!app.meeting_at} /> : null}
          {s === "meeting_required" ? (
            <div className="flex flex-col gap-3 border-t border-dashed border-line-2 pt-5">
              <h3 className="t3">{app.meeting_held_at ? "Change the recorded outcome" : "After the meeting"}</h3>
              <MeetingForm teacherId={app.id} />
            </div>
          ) : null}
        </section>
      ) : null}

      {canDecide && (open || (s === "rejected" && isAdmin)) ? (
        <section className="card flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="dec-h">
          <h2 id="dec-h" className="t2">
            {s === "rejected" ? "Reopen" : "Final decision"}
          </h2>
          <DecisionForm teacherId={app.id} canApprove={blockers.length === 0} blockers={blockers} reopenOnly={s === "rejected"} />
        </section>
      ) : null}

      <section className="card flex flex-col gap-5 p-5 sm:p-6" aria-labelledby="app-h">
        <h2 id="app-h" className="t2">
          The application
        </h2>
        <h3 className="t3">1. Personal information</h3>
        <dl className="grid gap-x-6 gap-y-3 text-[15px] sm:grid-cols-2">
          <Row label="Full legal name">{app.display_name}</Row>
          <Row label="Email">{email}</Row>
          <Row label="Phone">
            <span className="mono">{app.contact_phone}</span>
          </Row>
          <Row label="Country and city">{[countryLabel(app.country_code), app.city].filter(Boolean).join(", ")}</Row>
        </dl>
        <h3 className="t3 border-t border-dashed border-line-2 pt-5">2. Professional background</h3>
        <dl className="grid gap-x-6 gap-y-3 text-[15px] sm:grid-cols-2">
          <Row label="Professional title">{app.headline}</Row>
          <Row label="Years of experience">{experienceLabel(app.experience_band)}</Row>
          <Row label="Current employment">
            <span className={app.employment_status === "tsc_full_time" ? "font-semibold text-error" : ""}>{EMPLOYMENT.find(([c]) => c === app.employment_status)?.[1] ?? app.employment_status}</span>
          </Row>
          <Row label="Organisation or employer">{app.employer}</Row>
          <Row label="Education">{[educationLabel(app.education_level), app.education_field].filter(Boolean).join(", ")}</Row>
        </dl>
        <div className="flex flex-col gap-1">
          <span className="help">
            Biography (<span className="mono">{wordCount(app.bio)}</span> words; public after publication)
          </span>
          <p className="whitespace-pre-line">{app.bio}</p>
        </div>
        <div className="flex flex-col gap-1">
          <span className="help">Work experience and achievements</span>
          <p className="whitespace-pre-line">{app.achievements}</p>
        </div>
        <h3 className="t3 border-t border-dashed border-line-2 pt-5">3. Expertise</h3>
        <dl className="grid gap-x-6 gap-y-3 text-[15px] sm:grid-cols-2">
          <Row label="Primary category">{categoryLabel(app.primary_category)}</Row>
          <Row label="Specialisations">{app.specialisations.join(", ")}</Row>
          <Row label="Works with">{app.audiences.map(audienceLabel).join(", ")}</Row>
          <Row label="Languages">{app.languages.map(languageLabel).join(", ")}</Row>
          <Row label="Formats">{app.formats_offered.map((f) => FORMAT_LABELS[f as keyof typeof FORMAT_LABELS] ?? f).join(", ")}</Row>
          <Row label="What learners achieve">{app.learner_outcomes}</Row>
        </dl>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="hist-h">
        <h2 id="hist-h" className="t3">
          History
        </h2>
        <ol className="flex flex-col text-[15px]">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 border-b border-dashed border-line-2 py-2 last:border-0">
              <span className="mono text-ink-2">
                {formatDate(e.created_at)} {formatTime(e.created_at)}
              </span>
              <span className="font-semibold">{EVENTS[e.kind] ?? e.kind}</span>
              {e.note ? <span className="text-ink-2">{OUTCOMES[e.note] ?? e.note}</span> : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
