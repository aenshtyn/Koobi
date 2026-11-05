import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Guarded } from "@/components/app/shell";
import { getMyLesson } from "@/lib/data/lessons";
import { KIND_LABELS } from "@/domain/booking";
import { ReviewForm } from "../../forms";

export const metadata: Metadata = { title: "Leave a review" };

/** L15: only after a completed booking (FR-REV-1); one per booking. */
export default function ReviewPage(props: PageProps<"/bookings/[id]/review">) {
  return (
    <Guarded next="/sessions">
      <Review params={props.params} />
    </Guarded>
  );
}

async function Review({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lesson = await getMyLesson(id);
  if (!lesson) notFound();
  const { booking: b, review } = lesson;
  if (b.status !== "confirmed" || review) redirect(`/bookings/${b.id}`);
  return (
    <div className="flex max-w-[620px] flex-col gap-6">
      <Link className="btn3 self-start" href={`/bookings/${b.id}`}>
        Back to the booking
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="t1">How was the lesson?</h1>
        <p className="text-ink-2">
          {KIND_LABELS[b.kind]} with {b.teacher_name} · {b.title}
        </p>
      </div>
      <ReviewForm bookingId={b.id} />
    </div>
  );
}
