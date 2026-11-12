import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Guarded } from "@/components/app/shell";
import { getTeachSession } from "@/lib/data/lessons";
import { KIND_LABELS } from "@/domain/booking";
import { formatTime, formatWeekday } from "@/domain/format";
import { NoteForm } from "../../forms";

export const metadata: Metadata = { title: "Lesson note" };

/** T20: due before payment is released (FR-SESS-3). */
export default function NotePage(props: PageProps<"/teach/sessions/[id]/note">) {
  return (
    <Guarded next="/teach/bookings">
      <Note params={props.params} />
    </Guarded>
  );
}

async function Note({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getTeachSession(id);
  if (!found) notFound();
  const { session: s, booking: b } = found;
  if (s.status !== "awaiting_note") redirect(`/teach/sessions/${s.id}`);
  return (
    <div className="flex max-w-[620px] flex-col gap-6">
      <Link className="btn3 self-start" href={`/teach/sessions/${s.id}`}>
        Back to the lesson
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="t1">Lesson note</h1>
        <p className="text-ink-2">
          {KIND_LABELS[b.kind]} with {b.learner_alias} · <span className="mono">{formatWeekday(s.starts_at)} {formatTime(s.starts_at)}</span>
        </p>
      </div>
      <NoteForm sessionId={s.id} />
    </div>
  );
}
