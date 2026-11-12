import type { Metadata } from "next";
import { Suspense } from "react";
import { AlertCircle, CalendarDays, Check, CircleCheck, Clock, Info, Lightbulb, PlayCircle, Video as VideoIcon } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { VIDEO_STATUS, type VideoStatus } from "@/domain/expert";
import { formatDate } from "@/domain/format";
import { currentVideos, getVideos } from "@/lib/data/expert";
import { SubmitVideoButton, VideoUploader } from "../forms";
import { submitVideo } from "../actions";
import { BackToProfile, loadDraft } from "../shared";

export const metadata: Metadata = { title: "Introduction video" };

const GUIDELINES = [
  "Keep your video between 1 and 3 minutes.",
  "Introduce yourself and your professional background.",
  "Explain what you teach or help learners achieve.",
  "Record in a quiet, well-lit place.",
  "Make sure your face and voice are clear.",
];
const POSSIBLE: (VideoStatus | "none")[] = ["none", "submitted", "under_review", "changes_required", "approved", "rejected"];

export default function VideoPage(props: PageProps<"/teach/profile/video">) {
  return (
    <Guarded next="/teach/profile/video">
      <Suspense fallback={null}>
        <Done searchParams={props.searchParams} />
      </Suspense>
      <IntroVideo />
    </Guarded>
  );
}

async function Done({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { done } = await searchParams;
  if (done !== "submitted" && done !== "error") return null;
  return done === "submitted" ? (
    <div className="panel escrow mb-6 max-w-[860px] items-center" role="status">
      <span className="seal" aria-hidden="true" />
      <p>
        <b>Submitted for review.</b> We will tell you once a decision has been made.
      </p>
    </div>
  ) : (
    <p className="panel error mb-6 max-w-[860px]" role="alert">
      The video could not be submitted. Choose a video first.
    </p>
  );
}

const duration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

async function IntroVideo() {
  const { app } = await loadDraft();
  const videos = await getVideos(app.id);
  const { working, live } = currentVideos(videos);
  const key = working?.status ?? "none";
  const st = VIDEO_STATUS[key];
  const inReview = key === "submitted" || key === "under_review";
  const good = key === "approved";
  const bad = key === "rejected" || key === "changes_required";

  return (
    <div className="flex max-w-[860px] flex-col gap-6">
      <BackToProfile />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="t1">Introduction Video</h1>
          <p className="text-ink-2">Introduce yourself to learners through a short video on your public profile.</p>
        </div>
        {!live ? (
          <span className="pill bg-hi text-ink">
            <AlertCircle size={16} aria-hidden="true" />
            Video required for publication
          </span>
        ) : null}
      </div>

      <section className="card flex items-start gap-4 p-5 sm:p-6" aria-labelledby="status-h">
        <VideoIcon size={30} aria-hidden="true" className="flex-none text-orange" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 id="status-h" className="t3">
            Video submission status
          </h2>
          <p className={`flex items-center gap-2 text-[22px] font-bold ${good ? "text-forest-ink" : bad ? "text-error" : inReview ? "text-info" : "text-orange-ink"}`}>
            {good ? <CircleCheck size={24} aria-hidden="true" /> : inReview ? <Clock size={24} aria-hidden="true" /> : <AlertCircle size={24} aria-hidden="true" />}
            {st.label}
          </p>
          <p className="text-ink-2">{st.text}</p>
          {bad && working?.note ? (
            <p className="panel error mt-1">
              <b>From the reviewer:</b> {working.note}
            </p>
          ) : null}
          {live && working && working.id !== live.id ? <p className="help">Your approved video keeps playing on your profile until a new one is approved.</p> : null}
        </div>
      </section>

      {!inReview ? (
        <section className="card flex flex-col gap-5 p-5 sm:p-6" aria-labelledby="up-h">
          <div className="flex items-start gap-3">
            <PlayCircle size={30} aria-hidden="true" className="flex-none text-orange" />
            <div className="flex flex-col gap-1">
              <h2 id="up-h" className="t2">
                {live ? "Replace your introduction video" : "Upload your introduction video"}
              </h2>
              <p className="text-ink-2">Record or upload a short video introducing yourself, your professional background and what learners can expect from your learning experiences.</p>
            </div>
          </div>
          <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <VideoUploader replace={key === "uploaded"} />
            <div className="flex flex-col gap-3">
              <h3 className="t3 flex items-center gap-2">
                <Lightbulb size={20} aria-hidden="true" />
                Video guidelines
              </h3>
              <ul className="flex flex-col gap-2 text-[15px] leading-5">
                {GUIDELINES.map((g) => (
                  <li key={g} className="flex items-start gap-2.5">
                    <Check size={18} aria-hidden="true" className="mt-0.5 flex-none text-orange" />
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="flex items-center gap-2.5 rounded-[14px] bg-orange-wash px-4 py-3 text-[15px]">
            <Info size={18} aria-hidden="true" className="flex-none" />
            Your video is reviewed by Koobi before it appears on your public profile.
          </p>
          {working?.status === "uploaded" ? (
            <div className="flex flex-col gap-3 border-t border-dashed border-line-2 pt-5">
              <h3 className="t3">Your uploaded video</h3>
              <video className="aspect-video w-full max-w-[520px] rounded-[16px] border-[1.5px] border-ink bg-ink" controls preload="metadata" playsInline src={`/teach/profile/video/play?id=${working.id}`} />
              <p className="help">
                <span className="mono">{duration(working.duration_seconds)}</span> · <span className="mono">{Math.round(working.size_bytes / (1024 * 1024))} MB</span>. Watch it once, then submit.
              </p>
              <form action={submitVideo} className="self-start">
                <input type="hidden" name="id" value={working.id} />
                <SubmitVideoButton />
              </form>
            </div>
          ) : null}
        </section>
      ) : null}

      {working && working.status !== "uploaded" ? (
        <section className="card flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="rev-h">
          <h2 id="rev-h" className="t2 flex items-center gap-2.5">
            <Clock size={22} aria-hidden="true" className="text-orange" />
            Video review status
          </h2>
          <div className="grid items-start gap-6 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)_200px]">
            <video className="aspect-video w-full rounded-[16px] border-[1.5px] border-ink bg-ink" controls preload="metadata" playsInline src={`/teach/profile/video/play?id=${working.id}`} aria-label="Introduction video preview" />
            <div className="flex flex-col gap-2">
              <p className="flex flex-wrap items-center gap-2">
                <span className="t3">Introduction video</span>
                <span className={`pill ${st.tone}`}>{st.label}</span>
              </p>
              {working.submitted_at ? (
                <p className="flex items-center gap-2 text-[15px]">
                  <CalendarDays size={18} aria-hidden="true" className="text-ink-2" />
                  Submitted <span className="mono">{formatDate(working.submitted_at)}</span>
                </p>
              ) : null}
              <p className="text-ink-2">{st.text}</p>
            </div>
            <div className="flex flex-col gap-1.5 border-line-2 text-sm md:border-l md:border-dashed md:pl-5">
              <span className="font-semibold">Possible statuses</span>
              {POSSIBLE.map((p) => (
                <span key={p} className={p === key ? "font-semibold text-ink" : "text-ink-2"}>
                  {VIDEO_STATUS[p].label}
                </span>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
