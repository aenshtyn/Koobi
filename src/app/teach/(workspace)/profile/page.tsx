import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AlertCircle, ArrowRight, Award, BadgeCheck, Briefcase, Check, Circle, CircleCheck, Eye, Layers, MapPin, Megaphone, Pencil, PlayCircle, UserRound } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { ProgressRing } from "@/components/app/progress-ring";
import { REVIEWED_FIELDS, VIDEO_STATUS, canPublish, countryLabel, profileCompletion, profileInfoComplete } from "@/domain/expert";
import { initials } from "@/domain/format";
import { currentVideos, getCredentials, getMyApplication, getMyRequirements, getProfileChanges, getVideos } from "@/lib/data/expert";
import { PublishForm } from "./forms";
import { unpublishProfile, withdrawChanges } from "./actions";

export const metadata: Metadata = { title: "Public Profile" };

const SAVED: Record<string, React.ReactNode> = {
  review: <><b>Sent for review.</b> Learners keep seeing your current profile until the changes are approved.</>,
  saved: <><b>Saved.</b></>,
  withdrawn: <><b>Changes withdrawn.</b> Your profile stays as it is.</>,
  published: <><b>Your profile is published.</b> Learners can now find you and your approved learning experiences.</>,
  unpublished: <><b>Your profile is no longer public.</b> You can publish it again at any time.</>,
};

export default function ProfilePage(props: PageProps<"/teach/profile">) {
  return (
    <Guarded next="/teach/profile">
      <Suspense fallback={null}>
        <Saved searchParams={props.searchParams} />
      </Suspense>
      <Profile />
    </Guarded>
  );
}

async function Saved({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { saved } = await searchParams;
  const text = typeof saved === "string" ? SAVED[saved] : null;
  if (!text) return null;
  return (
    <div className="panel escrow mb-6 max-w-[980px] items-center" role="status">
      <span className="seal" aria-hidden="true" />
      <p>{text}</p>
    </div>
  );
}

function StatusPill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`pill ${ok ? "bg-forest-tint text-forest-ink" : "bg-hi text-ink"}`}>
      {ok ? <CircleCheck size={16} aria-hidden="true" /> : <AlertCircle size={16} aria-hidden="true" />}
      {children}
    </span>
  );
}

async function Profile() {
  const { ready, app } = await getMyApplication();
  if (!ready) {
    return (
      <div className="flex max-w-[640px] flex-col gap-4">
        <h1 className="t1">Public Profile</h1>
        <p className="panel info">The new Public Profile page is being switched on. Please come back shortly.</p>
      </div>
    );
  }
  if (!app) redirect("/teach/apply");
  const [req, credentials, videos, { pending, lastRejected }] = await Promise.all([getMyRequirements(), getCredentials(app.id), getVideos(app.id), getProfileChanges(app.id)]);
  const completion = profileCompletion(req);
  const { working } = currentVideos(videos);
  const videoStatus = VIDEO_STATUS[working?.status ?? "none"];
  const verified = credentials.filter((c) => c.kind !== "identity" && c.status === "approved").length;
  const waiting = credentials.filter((c) => c.kind !== "identity" && c.status === "submitted").length;
  const ready2 = canPublish(req);
  const firstGap = !req.photo || !req.basic ? "/teach/profile/basic" : !profileInfoComplete(req) ? "/teach/profile/professional" : !req.video ? "/teach/profile/video" : !req.experience ? "/teach/offers" : null;

  const rows = [
    { href: "/teach/profile/basic", Icon: UserRound, title: "Basic information", text: "Profile photo, name, professional title and country.", ok: req.photo && req.basic, label: req.photo && req.basic ? "Completed" : "Required" },
    { href: "/teach/profile/professional", Icon: Briefcase, title: "Professional information", text: "Biography, experience, expertise and languages.", ok: req.biography && req.background && req.expertise, label: req.biography && req.background && req.expertise ? "Completed" : "Required" },
    { href: "/teach/profile/video", Icon: PlayCircle, title: "Introduction video", text: "Upload, preview or replace your introduction video.", ok: req.video, label: req.video ? "Approved" : working ? videoStatus.label : "Required" },
    { href: "/teach/profile/credentials", Icon: Award, title: "Verified credentials", text: "See approved qualifications and submit more.", ok: verified > 0, label: verified ? `${verified} verified${waiting ? `, ${waiting} waiting` : ""}` : waiting ? `${waiting} waiting for review` : "Optional", optional: verified === 0 },
  ];
  const checklist = [
    { label: "Expert verification", text: "Identity and professional background approved.", done: req.approved, href: null },
    { label: "Profile information", text: "Photo and required professional details completed.", done: req.photo && profileInfoComplete(req), href: firstGap && firstGap.startsWith("/teach/profile/") && !firstGap.endsWith("video") ? firstGap : null },
    { label: "Introduction video", text: req.video ? "Uploaded and approved." : "Upload your video and submit it for Koobi review.", done: req.video, href: req.video ? null : "/teach/profile/video" },
    { label: "Learning experience", text: "At least one approved learning experience.", done: req.experience, href: req.experience ? null : "/teach/offers" },
  ];

  return (
    <div className="flex max-w-[980px] flex-col gap-7">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <h1 className="t1">Public Profile</h1>
          <StatusPill ok>Expert approved</StatusPill>
          <StatusPill ok={req.published}>{req.published ? "Published" : ready2 ? "Ready to publish" : "Profile incomplete"}</StatusPill>
        </div>
        <p className="text-ink-2">Manage your professional presence and how learners see you on Koobi.</p>
      </div>

      {pending ? (
        <div className="panel info flex-wrap items-center" role="status">
          <p className="min-w-0 flex-1">
            <b>Changes waiting for review:</b> {Object.keys(pending.changes).map((k) => REVIEWED_FIELDS[k] ?? k).join(", ")}. Learners keep seeing your current profile until they are approved.
            {pending.identity_recheck ? " A change of legal name is checked against your identity document." : ""}
          </p>
          <form action={withdrawChanges}>
            <button className="btn3" type="submit">
              Withdraw changes
            </button>
          </form>
        </div>
      ) : lastRejected ? (
        <div className="panel error" role="alert">
          <p>
            <b>Your last changes were not approved:</b> {lastRejected.note} Your profile stays as it was.
          </p>
        </div>
      ) : null}

      <section className="card flex flex-wrap items-center gap-6 p-5 sm:p-6" aria-label="Your profile">
        <div className="flex min-w-0 flex-[1_1_320px] items-center gap-5">
          {app.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- the expert's own photo, from our storage
            <img src={app.photo_url} alt={`Photo of ${app.display_name}`} className="h-[116px] w-[116px] flex-none rounded-[18px] border-[1.5px] border-ink object-cover" />
          ) : (
            <span className="av lg h-[116px]! w-[116px]! flex-none rounded-[18px]! text-[36px]!" aria-hidden="true">
              {initials(app.display_name ?? "")}
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="t2">{app.display_name}</h2>
            {app.headline ? <p>{app.headline}</p> : null}
            <span className="badge self-start">
              <span className="seal" aria-hidden="true" />
              Koobi Verified Expert
            </span>
            {app.country_code ? (
              <span className="flex items-center gap-1.5 text-[15px] text-ink-2">
                <MapPin size={16} aria-hidden="true" />
                {countryLabel(app.country_code)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-[1_1_300px] flex-wrap items-center justify-between gap-5 border-line-2 lg:border-l lg:border-dashed lg:pl-6">
          <div className="flex items-center gap-4">
            <ProgressRing pct={completion.pct}>
              <span className="mono text-[24px] font-semibold">{completion.pct}%</span>
            </ProgressRing>
            <span className="flex flex-col">
              <span className="font-semibold">Profile completion</span>
              <span className="help">
                <span className="mono">{completion.done}</span> of <span className="mono">{completion.total}</span> requirements met
              </span>
            </span>
          </div>
          <div className="flex flex-col gap-2.5">
            {firstGap && !req.published ? (
              <Link className="btn" href={firstGap}>
                <Pencil size={18} aria-hidden="true" />
                Complete profile
              </Link>
            ) : null}
            <Link className="btn2 ink" href="/teach/profile/preview">
              <Eye size={18} aria-hidden="true" />
              Preview
            </Link>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="mgmt-h">
        <h2 id="mgmt-h" className="t2 flex items-center gap-2.5">
          <Layers size={22} aria-hidden="true" />
          Profile management
        </h2>
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.href} className="card flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:px-5">
              <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-orange-wash text-orange-deep" aria-hidden="true">
                <r.Icon size={24} />
              </span>
              <span className="flex min-w-0 flex-[1_1_220px] flex-col">
                <span className="t3">{r.title}</span>
                <span className="help">{r.text}</span>
              </span>
              <span className={`flex items-center gap-1.5 text-[15px] font-semibold ${r.ok ? "text-forest-ink" : r.optional ? "text-ink-2" : "text-orange-ink"}`}>
                {r.ok ? <CircleCheck size={18} aria-hidden="true" /> : r.optional ? null : <AlertCircle size={18} aria-hidden="true" />}
                {r.label}
              </span>
              <Link className="btn2 ink" href={r.href} aria-label={`Edit ${r.title.toLowerCase()}`}>
                Edit <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="card flex flex-col gap-5 p-5 sm:p-6" aria-labelledby="ready-h">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="ready-h" className="t2 flex items-center gap-2.5">
            <Megaphone size={22} aria-hidden="true" className="text-orange" />
            Public profile readiness
          </h2>
          <StatusPill ok={req.published || ready2}>{req.published ? "Published" : ready2 ? "Ready" : "Incomplete"}</StatusPill>
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex flex-col gap-3">
            <p className="text-ink-2">Your profile can be published once every requirement is met. Approval as an expert does not publish it.</p>
            <ul className="flex flex-col">
              {checklist.map((c) => (
                <li key={c.label} className="flex items-start gap-3 border-b border-dashed border-line-2 py-3 last:border-0">
                  {c.done ? (
                    <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-forest text-white">
                      <Check size={15} aria-label="Done" />
                    </span>
                  ) : (
                    <Circle size={24} aria-label="Not done" className="mt-0.5 flex-none text-line-2" />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold">{c.label}</span>
                    <span className="help">{c.text}</span>
                  </span>
                  {c.href ? (
                    <Link className="btn3 flex-none" href={c.href}>
                      Do this
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col items-center gap-3 rounded-[18px] bg-orange-wash p-5 text-center">
            <BadgeCheck size={30} aria-hidden="true" className="text-orange" />
            {req.published ? (
              <>
                <p className="font-semibold">Your profile is public. Learners can find you on Koobi.</p>
                <Link className="btn2 ink" href={`/teachers/${app.slug}`}>
                  <Eye size={18} aria-hidden="true" />
                  View public profile
                </Link>
                <form action={unpublishProfile}>
                  <button className="btn3" type="submit">
                    Take my profile down
                  </button>
                </form>
              </>
            ) : ready2 ? (
              <>
                <p className="font-semibold">Every requirement is met. Publish to let learners find you.</p>
                <PublishForm />
                <Link className="btn3" href="/teach/profile/preview">
                  Preview first
                </Link>
              </>
            ) : (
              <>
                <p className="font-semibold">Complete the outstanding requirements to make your profile discoverable.</p>
                <Link className="btn2 ink" href="/teach/profile/preview">
                  <Eye size={18} aria-hidden="true" />
                  Preview public profile
                </Link>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
