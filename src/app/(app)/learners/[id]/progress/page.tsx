import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NotebookPen } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { LessonNote } from "@/components/app/lesson-note";
import { getProgress } from "@/lib/data/lessons";
import { KIND_LABELS } from "@/domain/booking";

export const metadata: Metadata = { title: "Lesson notes" };

/** L14: a note after every lesson, as a timeline (FR-SESS-3). */
export default function ProgressPage(props: PageProps<"/learners/[id]/progress">) {
  return (
    <Guarded next="/sessions">
      <Progress params={props.params} />
    </Guarded>
  );
}

async function Progress({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getProgress(id);
  if (!p) notFound();
  return (
    <div className="flex max-w-[680px] flex-col gap-6">
      <Link className="btn3 self-start" href="/learning">
        My Learning
      </Link>
      <h1 className="t1">{p.alias}’s lesson notes</h1>
      {p.items.length ? (
        <ol className="flex flex-col gap-4">
          {p.items.map(({ booking, note }) => (
            <li key={note.session_id} className="flex flex-col gap-2">
              <Link href={`/bookings/${booking.id}`} className="help">
                {KIND_LABELS[booking.kind]} · {booking.title} · {booking.teacher_name}
              </Link>
              <LessonNote note={note} heading={booking.title} />
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty">
          <NotebookPen size={24} aria-hidden="true" />
          <p className="font-semibold">No notes yet.</p>
          <p className="help">The teacher writes a short note after every lesson. They will appear here.</p>
        </div>
      )}
    </div>
  );
}
