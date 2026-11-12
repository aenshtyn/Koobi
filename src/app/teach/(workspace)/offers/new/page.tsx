import type { Metadata } from "next";
import Link from "next/link";
import { Guarded } from "@/components/app/shell";
import { getMyOffers, getMyTeacher, getPriceBands, getScheduleRows } from "@/lib/data/listings";
import { unionRanges, type Range } from "@/domain/schedule";
import { getSessionUser } from "@/lib/auth";
import { PRICE_BANDS } from "@/domain/listing-input";
import { ExperienceForm } from "../experience-form";

export const metadata: Metadata = { title: "New learning experience" };

export default function NewOfferPage() {
  return (
    <Guarded next="/teach/offers/new">
      <NewOffer />
    </Guarded>
  );
}

async function NewOffer() {
  const [teacher, user, bands] = await Promise.all([getMyTeacher(), getSessionUser(), getPriceBands()]);
  if (!teacher && !user?.dev) {
    return (
      <div className="empty max-w-[560px]">
        <p className="t3">Apply first, then create learning experiences.</p>
        <Link className="btn" href="/teach/apply">
          Apply to teach
        </Link>
      </div>
    );
  }
  const ids = teacher ? (await getMyOffers(teacher.id)).filter((o) => o.format === "one_to_one" && o.listing_status !== "retired").map((o) => o.id) : [];
  const ranges = unionRanges((await getScheduleRows(ids)).filter((r) => r.kind === "weekly") as unknown as Range[]).length;
  return (
    <div className="flex max-w-[1080px] flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link className="btn3 self-start" href="/teach/offers">
          Learning Experiences
        </Link>
        <h1 className="t1">Create Learning Experience</h1>
        <p className="text-ink-2">Four short steps. Save a draft at any point; a person reviews it when you submit, usually within two working days.</p>
      </div>
      <ExperienceForm initial={{ language_codes: teacher?.languages.length ? teacher.languages : ["en"] }} live={false} bands={{ ...PRICE_BANDS, ...bands }} windows={ranges} editing={false} />
    </div>
  );
}
