import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Guarded } from "@/components/app/shell";
import { getMyChecks, latest } from "@/lib/data/verification";
import { getMyOffer } from "@/lib/data/listings";
import { CHECKS } from "../../config";
import { CheckSection } from "../../check-section";

export const metadata: Metadata = { title: "Subject test" };

/** T7: a subject test for a school offer, booked and scored by a reviewer (FR-VER-4). */
export default function SubjectTestPage(props: PageProps<"/teach/verification/subject-test/[id]">) {
  return (
    <Guarded next="/teach/offers">
      <Body params={props.params} searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Body({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [offer, { checks, docs }] = await Promise.all([getMyOffer(id), getMyChecks()]);
  if (!offer) notFound();
  return (
    <div className="flex max-w-[680px] flex-col gap-6">
      <Link className="btn3 self-start" href={`/teach/offers/${offer.id}`}>
        Back to the learning experience
      </Link>
      <h1 className="t1">Subject test</h1>
      <p className="text-ink-2">{offer.title}</p>
      {sp.done === "sent" ? (
        <p className="panel escrow" role="status">
          Requested. A reviewer messages you to book the test.
        </p>
      ) : null}
      <CheckSection config={CHECKS.subject_test} check={latest(checks, "subject_test", offer.id)} docs={docs} path={`/teach/verification/subject-test/${offer.id}`} offeringId={offer.id} />
    </div>
  );
}
