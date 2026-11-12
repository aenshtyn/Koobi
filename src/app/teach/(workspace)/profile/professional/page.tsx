import type { Metadata } from "next";
import { Guarded } from "@/components/app/shell";
import { ProfessionalForm } from "../forms";
import { BackToProfile, PendingNote, loadDraft } from "../shared";

export const metadata: Metadata = { title: "Edit professional information" };

export default function ProfessionalPage() {
  return (
    <Guarded next="/teach/profile/professional">
      <Professional />
    </Guarded>
  );
}

async function Professional() {
  const { pending, draft } = await loadDraft();
  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <BackToProfile />
      <div className="flex flex-col gap-2">
        <h1 className="t1">Edit Professional Information</h1>
        <p className="text-ink-2">Your biography, experience, expertise and the languages you teach in.</p>
      </div>
      <PendingNote pending={pending} fields={["bio", "experience_band", "achievements", "education_level", "education_field", "primary_category", "specialisations", "audiences", "languages", "formats_offered", "learner_outcomes"]} />
      <section className="card p-5 sm:p-6" aria-label="Professional information">
        <ProfessionalForm draft={draft} />
      </section>
    </div>
  );
}
