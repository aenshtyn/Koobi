import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Guarded } from "@/components/app/shell";
import { getMyPackage } from "@/lib/data/account";
import { NewPackageForm } from "../../forms";

export const metadata: Metadata = { title: "Monthly plan" };

/** L10: in-person pairs after the first month (FR-BOOK-7). The database checks the pair qualifies. */
export default function ManagedPlanPage(props: PageProps<"/packages/[id]/managed-plan">) {
  return (
    <Guarded next="/sessions">
      <Plan params={props.params} />
    </Guarded>
  );
}

async function Plan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getMyPackage(id);
  if (!found || !found.pkg.offering) notFound();
  const { pkg } = found;
  const offering = pkg.offering!;
  return (
    <div className="flex max-w-[620px] flex-col gap-6">
      <Link className="btn3 self-start" href={`/packages/${pkg.id}`}>
        Back to the package
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="t1">Monthly plan</h1>
        <p className="text-ink-2">
          {offering.title} with {pkg.teacher?.display_name}, for {pkg.learner?.alias}
        </p>
      </div>
      <ul className="card flex flex-col gap-2 p-5 text-[15px]">
        <li>For in-person lessons, after the first month with the same teacher.</li>
        <li>You pay for four weeks at a time and renew each month; lessons are paid to the teacher only after they happen.</li>
        <li>Koobi keeps the lesson notes and receipts, and finds a replacement at no cost if the teacher stops.</li>
        <li>Koobi’s fee on plan lessons is lower, so more of what you pay reaches the teacher.</li>
      </ul>
      <NewPackageForm
        offeringId={offering.id}
        plan="managed"
        sizes={[
          { sessions: 4, label: "1 lesson a week for four weeks" },
          { sessions: 8, label: "2 lessons a week for four weeks" },
          { sessions: 12, label: "3 lessons a week for four weeks" },
        ]}
        learners={[{ value: pkg.learner_id, label: pkg.learner?.alias ?? "Same learner" }]}
        previousId={pkg.id}
        cta="Start the monthly plan"
      />
    </div>
  );
}
