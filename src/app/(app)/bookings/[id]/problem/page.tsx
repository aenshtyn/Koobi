import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Guarded } from "@/components/app/shell";
import { getMyLesson } from "@/lib/data/lessons";
import { GRACE_MINUTES, PROBLEM_TYPES, problemTypesFor } from "@/domain/booking";
import { ProblemForm } from "../../forms";

export const metadata: Metadata = { title: "Report a problem" };

/** L16: report a problem inside the window (FR-DISP-1). Payment stays on hold until staff decide. */
export default function ProblemPage(props: PageProps<"/bookings/[id]/problem">) {
  return (
    <Guarded next="/sessions">
      <Problem params={props.params} />
    </Guarded>
  );
}

async function Problem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lesson = await getMyLesson(id);
  if (!lesson) notFound();
  const { booking: b, disputes } = lesson;
  const open = disputes.find((d) => !["resolved", "closed"].includes(d.status));
  if (open) redirect(`/disputes/${open.id}`);
  const types = problemTypesFor(b.status, b.starts_at, new Date());
  return (
    <div className="flex max-w-[620px] flex-col gap-6">
      <Link className="btn3 self-start" href={`/bookings/${b.id}`}>
        Back to the booking
      </Link>
      <h1 className="t1">Report a problem</h1>
      {types.length ? (
        <ProblemForm bookingId={b.id} types={types.map((t) => [t, PROBLEM_TYPES[t]] as [string, string])} />
      ) : (
        <div className="empty">
          <p className="font-semibold">Nothing to report on this lesson right now.</p>
          <p className="help">
            You can report a problem after the lesson, or that the teacher has not come once {GRACE_MINUTES} minutes have passed after the start. For anything
            else, message the concierge.
          </p>
          <Link className="btn2" href="/messages">
            Messages
          </Link>
        </div>
      )}
    </div>
  );
}
