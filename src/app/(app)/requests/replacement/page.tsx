import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Guarded } from "@/components/app/shell";
import { getMyBooking } from "@/lib/data/bookings";
import { KIND_LABELS } from "@/domain/booking";
import { ReplacementForm } from "../../bookings/forms";

export const metadata: Metadata = { title: "Ask for a replacement" };

/** L18: a new match within 48 hours at no cost (FR-DISP-4). Goes to the concierge queue. */
export default function ReplacementPage(props: PageProps<"/requests/replacement">) {
  return (
    <Guarded next="/sessions">
      <Replacement searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Replacement({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const id = typeof sp.booking === "string" ? sp.booking : "";
  const b = id ? await getMyBooking(id) : null;
  if (!b || !b.paid_at) notFound();
  return (
    <div className="flex max-w-[620px] flex-col gap-6">
      <Link className="btn3 self-start" href={`/bookings/${b.id}`}>
        Back to the booking
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="t1">Find me a new teacher</h1>
        <p className="text-ink-2">
          Instead of {KIND_LABELS[b.kind].toLowerCase()} with {b.teacher_name}: {b.title}.
        </p>
      </div>
      <p className="panel info">
        The concierge sends you a new shortlist within 48 hours. The credit from this booking pays for the new lesson at checkout.
      </p>
      <ReplacementForm bookingId={b.id} />
    </div>
  );
}
