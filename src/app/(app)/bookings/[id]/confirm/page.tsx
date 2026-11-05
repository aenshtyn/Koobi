import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Guarded } from "@/components/app/shell";
import { LessonNote } from "@/components/app/lesson-note";
import { getMyLesson } from "@/lib/data/lessons";
import { AUTO_CONFIRM_HOURS, KIND_LABELS } from "@/domain/booking";
import { formatDuration, formatTime, formatWeekday } from "@/domain/format";
import { ConfirmForm } from "../../forms";

export const metadata: Metadata = { title: "Did it happen?" };

/** L13: one tap releases payment to the teacher (FR-SESS-4). */
export default function ConfirmPage(props: PageProps<"/bookings/[id]/confirm">) {
  return (
    <Guarded next="/sessions">
      <Confirm params={props.params} />
    </Guarded>
  );
}

async function Confirm({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lesson = await getMyLesson(id);
  if (!lesson) notFound();
  const { booking: b, note, session } = lesson;
  if (b.status !== "awaiting_confirmation") redirect(`/bookings/${b.id}`);
  const first = b.teacher_name.split(" ")[0];
  return (
    <div className="flex max-w-[620px] flex-col gap-6">
      <Link className="btn3 self-start" href={`/bookings/${b.id}`}>
        Back to the booking
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="t1">Did the lesson happen?</h1>
        <p className="text-ink-2">
          {KIND_LABELS[b.kind]} with {b.teacher_name} on <span className="mono">{formatWeekday(b.starts_at)} {formatTime(b.starts_at)}</span>
          {session?.actual_minutes ? (
            <>
              {" "}
              · {first} logged <span className="mono">{formatDuration(session.actual_minutes)}</span>
            </>
          ) : null}
        </p>
      </div>
      {note ? <LessonNote note={note} heading={`${first}’s note`} /> : null}
      <ConfirmForm bookingId={b.id} teacherFirst={first} />
      <p className="help">
        If we hear nothing within {AUTO_CONFIRM_HOURS} hours of the note, the lesson is confirmed and {first} is paid.
      </p>
      <Link className="btn3 self-start" href={`/bookings/${b.id}/problem`}>
        Something went wrong
      </Link>
    </div>
  );
}
