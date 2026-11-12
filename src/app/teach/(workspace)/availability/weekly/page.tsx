import type { Metadata } from "next";
import Link from "next/link";
import { Guarded } from "@/components/app/shell";
import { getMyOffers, getMyTeacher, getScheduleRows } from "@/lib/data/listings";
import { unionRanges, type Range } from "@/domain/schedule";
import { WeeklyEditor } from "../schedule-forms";

export const metadata: Metadata = { title: "Weekly availability" };

/** T13b: the hours that repeat every week, with several ranges a day. */
export default function WeeklyPage() {
  return (
    <Guarded next="/teach/availability/weekly">
      <Weekly />
    </Guarded>
  );
}

async function Weekly() {
  const teacher = await getMyTeacher();
  const offers = teacher ? (await getMyOffers(teacher.id)).filter((o) => o.format === "one_to_one" && o.listing_status !== "retired") : [];
  if (!teacher || !offers.length) {
    return (
      <div className="empty max-w-[560px]">
        <p className="t3">Create a one-to-one learning experience first.</p>
        <p className="help">Your weekly hours are saved with your learning experiences.</p>
        <Link className="btn" href="/teach/offers/new">
          Create learning experience
        </Link>
      </div>
    );
  }
  const rows = await getScheduleRows(offers.map((o) => o.id));
  const weekly = unionRanges(rows.filter((r) => r.kind === "weekly") as unknown as Range[]);
  return (
    <div className="flex max-w-[1080px] flex-col gap-6">
      <nav className="flex items-center gap-2 text-[15px] text-ink-2" aria-label="Breadcrumb">
        <Link href="/teach/availability">Availability & Schedule</Link>
        <span aria-hidden="true">/</span>
        <span>Weekly availability</span>
      </nav>
      <div className="flex flex-col gap-2">
        <h1 className="t1">Weekly Availability</h1>
        <p className="text-ink-2">Set your regular working hours. Learners book inside them, for each learning experience’s session length.</p>
      </div>
      <WeeklyEditor initial={weekly} />
    </div>
  );
}
