import type { Metadata } from "next";
import { Star } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { getTeacherReviews } from "@/lib/data/lessons";
import { formatDate } from "@/domain/format";
import { ReplyForm } from "../sessions/forms";

export const metadata: Metadata = { title: "Reviews" };

/** T24: reply once to each review (FR-REV-1). Ratings show publicly from three reviews. */
export default function TeachReviewsPage(props: PageProps<"/teach/reviews">) {
  return (
    <Guarded next="/teach/reviews">
      <Reviews searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Reviews({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, reviews] = await Promise.all([searchParams, getTeacherReviews()]);
  const published = reviews.filter((r) => r.status === "published");
  const avg = published.length ? published.reduce((s, r) => s + r.rating, 0) / published.length : null;
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <h1 className="t1">Reviews</h1>
      {sp.done === "replied" ? (
        <p className="panel escrow" role="status">
          Reply posted.
        </p>
      ) : null}
      {published.length ? (
        <p className="help">
          <span className="mono">{published.length}</span> {published.length === 1 ? "review" : "reviews"}
          {published.length >= 3 && avg !== null ? (
            <>
              {" "}
              · average <span className="mono">{avg.toFixed(1)}</span>
            </>
          ) : (
            " · your average shows publicly from three reviews"
          )}
        </p>
      ) : null}
      {reviews.length ? (
        <ul className="flex flex-col gap-4">
          {reviews.map((r) => (
            <li key={r.id} className="card flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">
                  <span className="mono">{r.rating}/5</span> · {r.learner_alias}
                </span>
                <span className="help mono">{formatDate(r.created_at)}</span>
              </div>
              <p className="help">{r.title}</p>
              {r.body ? <p className="whitespace-pre-line">{r.body}</p> : null}
              {r.status !== "published" ? <p className="panel info">Hidden by the concierge while it is checked.</p> : null}
              {r.teacher_reply ? (
                <div className="panel">
                  <span>
                    <b>Your reply:</b> {r.teacher_reply}
                  </span>
                </div>
              ) : (
                <ReplyForm reviewId={r.id} />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <Star size={24} aria-hidden="true" />
          <p className="font-semibold">No reviews yet.</p>
          <p className="help">Learners can review a lesson once it is confirmed.</p>
        </div>
      )}
    </div>
  );
}
