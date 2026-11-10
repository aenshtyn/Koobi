import type { Metadata } from "next";
import { Guarded } from "@/components/app/shell";
import { getCounties, getMyTeacher } from "@/lib/data/listings";
import { getSessionUser } from "@/lib/auth";
import { CATEGORY_TRACKS } from "@/domain/listing-input";
import { ApplicationForm } from "../forms";

export const metadata: Metadata = { title: "Apply to teach" };

export default function ApplyPage() {
  return (
    <Guarded next="/teach/apply">
      <Apply />
    </Guarded>
  );
}

async function Apply() {
  const [teacher, counties, user] = await Promise.all([getMyTeacher(), getCounties(), getSessionUser()]);
  const categories = teacher
    ? Object.entries(CATEGORY_TRACKS)
        .filter(([, tracks]) => tracks.some((t) => teacher.tracks.includes(t)))
        .map(([c]) => c)
    : [];
  const initial = teacher
    ? {
        display_name: teacher.display_name,
        headline: teacher.headline,
        bio: teacher.bio,
        teacher_type: teacher.teacher_type,
        employment_status: teacher.employment_status,
        county_code: teacher.county_code,
        languages: teacher.languages,
        categories,
        declaration: teacher.employment_declared_at ? "on" : "",
      }
    : { display_name: user?.dev ? "" : user?.name ?? "", languages: ["en"] };
  return (
    <div className="flex max-w-[720px] flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="t1">{teacher ? "Your teaching profile" : "Apply to teach"}</h1>
        <p className="text-ink-2">
          {teacher
            ? "Learners see this on every learning experience. Changes to a live profile are reviewed again."
            : "Tell us what you have done. Save a draft any time; send it for review when it is ready. We usually decide within two working days."}
        </p>
      </div>
      <ApplicationForm initial={initial} counties={counties} live={teacher?.listing_status === "approved"} />
    </div>
  );
}
