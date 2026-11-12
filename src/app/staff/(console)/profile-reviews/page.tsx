import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { CREDENTIAL_KINDS, REVIEWED_FIELDS, VIDEO_STATUS, showField } from "@/domain/expert";
import { formatDate } from "@/domain/format";
import { STAFF_ROLES, getSessionUser } from "@/lib/auth";
import { getProfileReviewQueue } from "@/lib/data/expert";
import { DocumentDecision } from "../applications/forms";
import { ChangeDecision, VideoDecision } from "./forms";

export const metadata: Metadata = { title: "Profile reviews", robots: { index: false } };

const DONE: Record<string, string> = { video: "Video decision saved. The expert has been told.", change: "Saved. The expert has been told.", document: "Saved. The expert has been told." };

export default function ProfileReviewsPage(props: PageProps<"/staff/profile-reviews">) {
  return (
    <Guarded next="/staff/profile-reviews" anyOf={STAFF_ROLES}>
      <div className="flex max-w-[980px] flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="t1">Profile reviews</h1>
          <p className="text-ink-2">What approved experts have sent for review: introduction videos, credentials added after approval, and changes to public information. Nothing here is public until you approve it.</p>
        </div>
        <Suspense fallback={null}>
          <Done searchParams={props.searchParams} />
        </Suspense>
        <Queue />
      </div>
    </Guarded>
  );
}

async function Done({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { done } = await searchParams;
  if (typeof done !== "string" || !DONE[done]) return null;
  return (
    <div className="panel escrow items-center" role="status">
      <span className="seal" aria-hidden="true" />
      <p>{DONE[done]}</p>
    </div>
  );
}

const duration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

async function Queue() {
  const [{ ready, videos, credentials, changes }, user] = await Promise.all([getProfileReviewQueue(), getSessionUser()]);
  if (!ready) return <p className="panel info">Profile reviews are being switched on: the database migration has not been applied here yet.</p>;
  const canDecide = !!user?.roles.some((r) => r === "reviewer" || r === "admin");
  return (
    <>
      {!canDecide ? <p className="panel info">You can see the queue. Deciding needs the reviewer or admin role.</p> : null}

      <section className="flex flex-col gap-4" aria-labelledby="v-h">
        <h2 id="v-h" className="t2">
          Introduction videos <span className="mono text-[16px] text-ink-2">{videos.length}</span>
        </h2>
        {videos.length ? (
          videos.map((v) => (
            <article key={v.id} className="card grid items-start gap-5 p-5 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
              {canDecide ? (
                <video className="aspect-video w-full rounded-[14px] border-[1.5px] border-ink bg-ink" controls preload="none" playsInline src={`/teach/profile/video/play?id=${v.id}`} aria-label={`Introduction video from ${v.teacher?.display_name}`} />
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-[14px] bg-sand text-ink-2">Reviewers only</div>
              )}
              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <h3 className="t3">{v.teacher?.display_name}</h3>
                  <p className="help">{v.teacher?.headline}</p>
                  <p className="flex flex-wrap items-center gap-2 text-[15px]">
                    <span className={`pill ${VIDEO_STATUS[v.status].tone}`}>{VIDEO_STATUS[v.status].label}</span>
                    <span className="mono">{duration(v.duration_seconds)}</span>
                    <span className="mono">{Math.round(v.size_bytes / (1024 * 1024))} MB</span>
                    {v.submitted_at ? (
                      <span className="text-ink-2">
                        sent <span className="mono">{formatDate(v.submitted_at)}</span>
                      </span>
                    ) : null}
                  </p>
                </div>
                <p className="help">Check: 1 to 3 minutes, the expert introduces themselves and what they teach, face and voice are clear, no phone numbers or links. Playing it marks it &ldquo;Under review&rdquo; for the expert.</p>
                {canDecide ? <VideoDecision id={v.id} /> : null}
              </div>
            </article>
          ))
        ) : (
          <p className="help">No videos waiting.</p>
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="c-h">
        <h2 id="c-h" className="t2">
          Credentials <span className="mono text-[16px] text-ink-2">{credentials.length}</span>
        </h2>
        {credentials.length ? (
          credentials.map((c) => (
            <article key={c.id} className="card flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="flex min-w-0 flex-[1_1_260px] flex-col">
                  <span className="t3">{c.title}</span>
                  <span className="help">
                    {CREDENTIAL_KINDS[c.kind]}
                    {c.issuer ? ` · ${c.issuer}` : ""} · {c.teacher?.display_name} · uploaded <span className="mono">{formatDate(c.created_at)}</span>
                  </span>
                </span>
                {canDecide ? (
                  <a className="btn3" href={`/staff/applications/document?id=${c.id}`} target="_blank" rel="noreferrer">
                    Open (logged) <ExternalLink size={15} aria-hidden="true" />
                  </a>
                ) : null}
              </div>
              {c.kind === "identity" ? <p className="help">A new identity document, usually after a change of legal name. Compare it with the name change below.</p> : <p className="help">Once verified it shows on the public profile with this name and type.</p>}
              {canDecide ? <DocumentDecision id={c.id} back="/staff/profile-reviews" /> : null}
            </article>
          ))
        ) : (
          <p className="help">No credentials waiting.</p>
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="p-h">
        <h2 id="p-h" className="t2">
          Changes to public information <span className="mono text-[16px] text-ink-2">{changes.length}</span>
        </h2>
        {changes.length ? (
          changes.map((ch) => (
            <article key={ch.id} className="card flex flex-col gap-4 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="t3">{ch.teacher?.display_name}</h3>
                <span className="help">
                  sent <span className="mono">{formatDate(ch.updated_at)}</span> ·{" "}
                  <Link href={`/staff/applications/${ch.teacher_id}`}>application</Link>
                </span>
              </div>
              {ch.identity_recheck ? (
                <p className="panel error">
                  <b>Legal name change.</b> Check the new name against the identity document on the application before approving. Ask for a new document if it does not match.
                </p>
              ) : null}
              <div className="overflow-x-auto">
                <table className="table-k w-full text-[15px]">
                  <thead>
                    <tr>
                      <th scope="col">Field</th>
                      <th scope="col">Live now</th>
                      <th scope="col">Proposed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(ch.changes).map(([k, v]) => (
                      <tr key={k} className="align-top">
                        <th scope="row" className="font-semibold whitespace-nowrap">
                          {REVIEWED_FIELDS[k] ?? k}
                        </th>
                        <td className="whitespace-pre-line text-ink-2">{k === "photo_url" ? <Photo url={ch.teacher?.photo_url ?? null} /> : showField(k, ch.teacher?.[k])}</td>
                        <td className="whitespace-pre-line">{k === "photo_url" ? <Photo url={typeof v === "string" ? v : null} /> : showField(k, v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canDecide ? <ChangeDecision id={ch.id} /> : null}
            </article>
          ))
        ) : (
          <p className="help">No changes waiting.</p>
        )}
      </section>
    </>
  );
}

function Photo({ url }: { url: string | null }) {
  if (!url) return <>—</>;
  // eslint-disable-next-line @next/next/no-img-element -- the expert's own photo, from our storage
  return <img src={url} alt="Profile photo" className="h-24 w-24 rounded-[12px] border-[1.5px] border-ink object-cover" />;
}
