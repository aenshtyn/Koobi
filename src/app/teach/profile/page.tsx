import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Languages, MapPin, Pencil } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { ListingPill } from "@/components/app/listing-pill";
import { getCounties, getMyOffers, getMyTeacher } from "@/lib/data/listings";
import { formatDate, initials } from "@/domain/format";
import { LANGUAGES, TEACHER_TYPES, blocksSubmission } from "@/domain/listing-input";

export const metadata: Metadata = { title: "Profile preview" };

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
  if (!saved) return null;
  return (
    <div className="panel escrow mb-6 items-center" role="status">
      <span className="seal" aria-hidden="true" />
      <p>{saved === "submitted" ? <><b>Sent for review.</b> We usually decide within two working days.</> : <><b>Draft saved.</b> Send it for review when it is ready.</>}</p>
    </div>
  );
}

async function Profile() {
  const teacher = await getMyTeacher();
  if (!teacher) {
    return (
      <div className="empty max-w-[560px]">
        <p className="t3">You have not applied yet.</p>
        <p className="help">Your profile is what learners see on every offer.</p>
        <Link className="btn" href="/teach/apply">
          Apply to teach
        </Link>
      </div>
    );
  }
  const [offers, counties] = await Promise.all([getMyOffers(teacher.id), getCounties()]);
  const county = counties.find((c) => c.code === teacher.county_code)?.label;
  const type = TEACHER_TYPES.find(([c]) => c === teacher.teacher_type)?.[1];
  return (
    <div className="flex max-w-[860px] flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="t1">Profile preview</h1>
        <div className="flex items-center gap-3">
          <ListingPill state={teacher.listing_status} />
          <Link className="btn2 ink" href="/teach/apply">
            <Pencil size={16} aria-hidden="true" />
            Edit
          </Link>
        </div>
      </div>

      {teacher.listing_status === "rejected" && teacher.rejection_reason ? (
        <div className="panel error" role="alert">
          <p>
            <b>Changes needed:</b> {teacher.rejection_reason}
          </p>
        </div>
      ) : null}
      {teacher.listing_status === "draft" ? (
        <div className="panel info" role="note">
          <p>
            <b>Draft.</b> Only you can see this. {blocksSubmission(teacher.employment_status) ? "Full-time TSC teachers cannot be listed." : <>When it is ready, <Link href="/teach/apply">send it for review</Link>.</>}
          </p>
        </div>
      ) : null}
      {teacher.listing_status === "pending_review" ? (
        <div className="panel info" role="note">
          <p>
            <b>In review</b> since <span className="mono">{teacher.submitted_at ? formatDate(teacher.submitted_at) : "today"}</span>. We usually decide within two working days.
          </p>
        </div>
      ) : null}

      <section className="card flex flex-wrap items-start gap-6 p-6" aria-label="What learners see">
        <span className="av lg" aria-hidden="true">
          {initials(teacher.display_name)}
        </span>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3">
          <h2 className="t2">{teacher.display_name}</h2>
          <p className="text-[17px]">{teacher.headline}</p>
          <div className="flex flex-wrap gap-2">
            {county ? (
              <span className="pill">
                <MapPin size={16} aria-hidden="true" />
                {county}
              </span>
            ) : null}
            <span className="pill">
              <Languages size={16} aria-hidden="true" />
              {teacher.languages.map((l) => LANGUAGES.find(([c]) => c === l)?.[1] ?? l).join(", ")}
            </span>
            {type ? <span className="pill">{type}</span> : null}
          </div>
          <p className="whitespace-pre-line text-ink-2">{teacher.bio}</p>
          <p className="help">Badges appear here as your checks pass, each with its date. Phone numbers never appear.</p>
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="offers-h">
        <div className="flex items-center justify-between gap-3">
          <h2 id="offers-h" className="t3">
            Your offers
          </h2>
          <Link className="btn3" href="/teach/offers">
            Manage offers
          </Link>
        </div>
        {offers.length ? (
          <ul className="flex flex-col gap-2">
            {offers.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-line-2 py-2">
                <Link href={`/teach/offers/${o.id}`}>{o.title}</Link>
                <ListingPill state={o.listing_status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="help">No offers yet.</p>
        )}
        <p className="help">An offer appears on Explore only when both it and this profile are approved.</p>
      </section>
    </div>
  );
}
