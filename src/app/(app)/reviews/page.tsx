import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, MessageSquareText, Star } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { StatCard } from "@/components/app/stat-card";
import { getLearnerBookings, getMyReviews, type LearnerBooking } from "@/lib/data/learning";
import { formatDate, initials } from "@/domain/format";
import { FormatTag } from "../bookings/booking-bits";
import { ReviewDialog } from "./review-dialog";

export const metadata: Metadata = { title: "My Reviews" };

/** My Reviews: completed bookings still to review, and the reviews already posted. */
export default function ReviewsPage(props: PageProps<"/reviews">) {
  return (
    <Guarded next="/reviews">
      <Reviews searchParams={props.searchParams} />
    </Guarded>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={18} aria-hidden="true" className={i <= n ? "fill-marker text-marker" : "text-line-2"} />
      ))}
    </span>
  );
}

function Who({ b }: { b: LearnerBooking }) {
  return (
    <div className="flex items-start gap-3.5">
      <span className="av lg" aria-hidden="true">
        {initials(b.teacher_name)}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="t3">{b.teacher_name}</span>
        {b.teacher_headline ? <span className="text-[14px] leading-5 text-ink-2">{b.teacher_headline}</span> : null}
        <Link href={`/learning/${b.offering_id}`} className="font-semibold text-ink no-underline hover:underline">
          {b.title}
        </Link>
        <span className="flex flex-wrap items-center gap-2 text-[14px] leading-5 text-ink-2">
          <FormatTag format={b.format} />
          <span className="flex items-center gap-1.5">
            <CalendarDays size={15} aria-hidden="true" />
            Completed: <span className="mono">{formatDate(b.when)}</span>
          </span>
        </span>
      </div>
    </div>
  );
}

async function Reviews({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, bookings, reviews] = await Promise.all([searchParams, getLearnerBookings(), getMyReviews()]);
  const waiting = bookings.filter((b) => b.status === "confirmed" && !b.reviewed).sort((a, b) => b.when.localeCompare(a.when));
  const tab = sp.tab === "submitted" ? "submitted" : "todo";
  const posted = reviews.map((r) => ({ r, b: bookings.find((b) => b.id === r.booking_id) })).filter((x): x is { r: (typeof reviews)[number]; b: LearnerBooking } => !!x.b);
  return (
    <div className="flex max-w-[920px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="t1">My Reviews</h1>
        <p className="text-ink-2">Share feedback about the experts and learning experiences you have completed.</p>
      </div>
      {sp.done === "reviewed" ? (
        <p className="panel escrow" role="status">
          Thank you. Your review is on the learning experience page.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:max-w-[640px]">
        <StatCard icon={MessageSquareText} value={waiting.length} label="Awaiting reviews" sub="Completed, not yet reviewed" href="/reviews" />
        <StatCard icon={Star} tone="forest" value={reviews.length} label="Reviews submitted" sub="All the reviews you posted" href="/reviews?tab=submitted" />
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="Reviews">
        <Link className={`chip sm${tab === "todo" ? " on" : ""}`} href="/reviews" aria-current={tab === "todo" ? "page" : undefined}>
          To review (<span className="mono">{waiting.length}</span>)
        </Link>
        <Link className={`chip sm${tab === "submitted" ? " on" : ""}`} href="/reviews?tab=submitted" aria-current={tab === "submitted" ? "page" : undefined}>
          Submitted reviews
        </Link>
      </nav>

      {tab === "todo" ? (
        waiting.length ? (
          <ul className="flex flex-col gap-3">
            {waiting.map((b) => (
              <li key={b.id} className="card flex flex-wrap items-end justify-between gap-4 p-5">
                <Who b={b} />
                <ReviewDialog bookingId={b.id} expert={b.teacher_name} headline={b.teacher_headline} title={b.title} initials={initials(b.teacher_name)} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">
            <Star size={24} aria-hidden="true" />
            <p className="font-semibold">No reviews waiting for you.</p>
            <p className="help">You can review a lesson once it is completed and confirmed.</p>
          </div>
        )
      ) : posted.length ? (
        <ul className="flex flex-col gap-3">
          {posted.map(({ r, b }) => (
            <li key={r.id} className="card flex flex-col gap-3 p-5">
              <Who b={b} />
              <div className="flex flex-col gap-2 border-t border-dashed border-line-2 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Stars n={r.rating} />
                  <span className="text-[14px] text-ink-2">
                    Posted <span className="mono">{formatDate(r.created_at)}</span>
                    {r.status !== "published" ? " · being checked by Koobi" : ""}
                  </span>
                </div>
                {r.body ? <p className="whitespace-pre-line">{r.body}</p> : <p className="text-ink-2">No written feedback.</p>}
                {r.teacher_reply ? (
                  <p className="rounded-[12px] bg-sand px-3 py-2 text-[15px] leading-[22px]">
                    <span className="font-semibold">{b.teacher_name.split(" ")[0]} replied:</span> {r.teacher_reply}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
          <li className="help">A review cannot be changed once posted. The expert can reply to it once.</li>
        </ul>
      ) : (
        <div className="empty">
          <Star size={24} aria-hidden="true" />
          <p className="font-semibold">You have not posted a review yet.</p>
          <p className="help">Reviews you post show here, with the expert’s reply.</p>
        </div>
      )}
    </div>
  );
}
