import type { Metadata } from "next";
import { Guarded } from "@/components/app/shell";
import { PhotoUploader } from "@/components/expert/uploaders";
import { BasicForm } from "../forms";
import { BackToProfile, PendingNote, loadDraft } from "../shared";

export const metadata: Metadata = { title: "Edit basic information" };

export default function BasicPage() {
  return (
    <Guarded next="/teach/profile/basic">
      <Basic />
    </Guarded>
  );
}

async function Basic() {
  const { app, pending, draft, email } = await loadDraft();
  const photoWaiting = typeof pending?.changes.photo_url === "string";
  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <BackToProfile />
      <div className="flex flex-col gap-2">
        <h1 className="t1">Edit Basic Information</h1>
        <p className="text-ink-2">The personal details shown on your Koobi public profile.</p>
      </div>
      <PendingNote pending={pending} fields={["display_name", "headline", "country_code", "photo_url"]} />
      <section className="card flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="photo-h">
        <div className="flex flex-col gap-1">
          <h2 id="photo-h" className="t2">
            Profile photo
          </h2>
          <p className="help">{photoWaiting ? "This new photo is waiting for review. Learners still see your earlier photo." : app.photo_url ? "This is your current profile photo." : "A profile photo is required before your profile can be published."}</p>
        </div>
        <PhotoUploader url={draft.photo_url} name={draft.display_name ?? ""} />
      </section>
      <section className="card p-5 sm:p-6" aria-label="Your details">
        <BasicForm draft={draft} email={email} />
      </section>
    </div>
  );
}
