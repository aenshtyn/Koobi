import type { NoteRow } from "@/lib/data/lessons";
import { formatDate, formatTime } from "@/domain/format";

/** The teacher's note after a lesson (FR-SESS-3): what was covered, progress, next steps. */
export function LessonNote({ note, heading = "Lesson note" }: { note: NoteRow; heading?: string }) {
  return (
    <section className="card flex flex-col gap-3 p-5" aria-label={heading}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="t3">{heading}</h2>
        <span className="help mono">
          {formatDate(note.filed_at)} {formatTime(note.filed_at)}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="label">Covered</span>
        <p className="whitespace-pre-line">{note.covered}</p>
      </div>
      {note.progress ? (
        <div className="flex flex-col gap-1">
          <span className="label">Progress</span>
          <p className="whitespace-pre-line">{note.progress}</p>
        </div>
      ) : null}
      {note.next_steps ? (
        <div className="flex flex-col gap-1">
          <span className="label">Next time</span>
          <p className="whitespace-pre-line">{note.next_steps}</p>
        </div>
      ) : null}
    </section>
  );
}
