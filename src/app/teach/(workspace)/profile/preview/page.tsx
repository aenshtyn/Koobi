import type { Metadata } from "next";
import Link from "next/link";
import { Guarded } from "@/components/app/shell";
import { ExpertProfile, type ProfileData } from "@/components/expert/profile-view";
import { languageLabel, type Application } from "@/domain/expert";
import { currentVideos, getCredentials, getMyRequirements, getVideos } from "@/lib/data/expert";
import { getMyOffers } from "@/lib/data/listings";
import { BackToProfile, loadDraft } from "../shared";

export const metadata: Metadata = { title: "Preview public profile" };

export default function PreviewPage(props: PageProps<"/teach/profile/preview">) {
  return (
    <Guarded next="/teach/profile/preview">
      <Preview searchParams={props.searchParams} />
    </Guarded>
  );
}

/**
 * Two views of the same page: the draft (what is live plus everything waiting for review or not yet
 * published) and what learners see now. They are never mixed.
 */
async function Preview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ app, pending, draft }, sp] = await Promise.all([loadDraft(), searchParams]);
  const [req, credentials, videos, offers] = await Promise.all([getMyRequirements(), getCredentials(app.id), getVideos(app.id), getMyOffers(app.id)]);
  const { working, live } = currentVideos(videos);
  const published = req.published;
  const view = sp.view === "live" ? "live" : "draft";
  const source: Application = view === "draft" ? draft : app;
  const video = view === "draft" ? (working ?? live) : live;
  const shownCredentials = credentials.filter((c) => c.kind !== "identity" && (view === "draft" ? c.status !== "rejected" : c.status === "approved"));
  const shownOffers = offers.filter((o) => (view === "draft" ? !["retired", "rejected"].includes(o.listing_status) : o.listing_status === "approved"));
  const changed = new Set(view === "draft" ? Object.keys(pending?.changes ?? {}) : []);

  const data: ProfileData = {
    name: source.display_name ?? "",
    title: source.headline,
    photoUrl: source.photo_url,
    videoSrc: video ? `/teach/profile/video/play?id=${video.id}` : null,
    verified: true,
    countryCode: source.country_code,
    experienceBand: source.experience_band,
    bio: source.bio,
    achievements: source.achievements,
    credentials: shownCredentials.map((c) => ({ title: c.status === "approved" ? c.title : `${c.title} (waiting for review)`, kind: c.kind, issuer: c.issuer })),
    category: source.primary_category,
    specialisations: source.specialisations,
    audiences: source.audiences,
    languages: source.languages.map(languageLabel),
    outcomes: source.learner_outcomes,
    rating: null,
    reviewCount: 0,
    weeklyHours: [],
  };
  const notes: string[] = [];
  if (view === "draft") {
    if (changed.size) notes.push("details marked “Waiting for review” are not live yet");
    if (video && video.status !== "approved") notes.push("the video shown is not approved yet");
    if (shownCredentials.some((c) => c.status !== "approved")) notes.push("some credentials are still waiting for review");
    if (shownOffers.some((o) => o.listing_status !== "approved")) notes.push("some learning experiences are not approved yet");
  }

  return (
    <div className="flex max-w-[1080px] flex-col gap-6">
      <BackToProfile />
      <div className="flex flex-col gap-2">
        <h1 className="t1">Preview</h1>
        <p className="text-ink-2">How learners see you. Ratings, reviews and bookable times appear on the published page from real lessons.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Which version to preview">
        <Link role="tab" aria-selected={view === "draft"} className={`chip ${view === "draft" ? "on" : ""}`} href="/teach/profile/preview">
          Your draft
        </Link>
        <Link role="tab" aria-selected={view === "live"} className={`chip ${view === "live" ? "on" : ""}`} href="/teach/profile/preview?view=live">
          Published now
        </Link>
      </div>
      {view === "draft" ? (
        <p className="panel info" role="note">
          <span>
            <b>Draft.</b> {published ? "This is your published profile with your unpublished changes on top" : "Nothing here is public yet"}
            {notes.length ? `: ${notes.join("; ")}.` : "."}
          </span>
        </p>
      ) : published ? (
        <p className="panel escrow items-center" role="note">
          <span className="seal" aria-hidden="true" />
          <span>
            <b>Published.</b> This is what learners see now. <Link href={`/teachers/${app.slug}`}>Open the public page</Link>.
          </span>
        </p>
      ) : (
        <p className="panel" role="note">
          <span>
            <b>Not published.</b> Learners cannot see your profile yet. Below is the approved information that would be shown if you published now.
          </span>
        </p>
      )}
      <div className="rounded-[24px] border-[1.5px] border-dashed border-line-2 bg-paper p-4 sm:p-6">
        <ExpertProfile
          data={data}
          changed={changed}
          showEmpty
          experiences={
            <section className="flex flex-col gap-3" aria-labelledby="pv-offers">
              <h2 id="pv-offers" className="h4">
                Learning experiences
              </h2>
              {shownOffers.length ? (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {shownOffers.map((o) => (
                    <li key={o.id} className="card flex flex-col gap-1.5 p-4">
                      <span className="font-semibold">{o.title}</span>
                      {o.summary ? <span className="text-[15px] text-ink-2">{o.summary}</span> : null}
                      {o.listing_status !== "approved" ? <span className="pill self-start bg-hi text-ink">Not approved yet</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-2">{view === "live" ? "No approved learning experience yet." : "No learning experience yet."}</p>
              )}
            </section>
          }
        />
      </div>
    </div>
  );
}
