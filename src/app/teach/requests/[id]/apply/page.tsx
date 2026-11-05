import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Guarded } from "@/components/app/shell";
import { getTeacherInbox } from "@/lib/data/matching";
import { getMyOffers, getMyTeacher } from "@/lib/data/listings";
import { formatKES } from "@/domain/format";
import { ApplyForm } from "../../apply-form";

export const metadata: Metadata = { title: "Apply to a request" };

export default function ApplyPage(props: PageProps<"/teach/requests/[id]/apply">) {
  return (
    <Guarded next="/teach/requests">
      <Apply params={props.params} />
    </Guarded>
  );
}

async function Apply({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [teacher, inbox] = await Promise.all([getMyTeacher(), getTeacherInbox()]);
  const r = inbox.find((x) => x.id === id);
  if (!teacher || !r) notFound();
  const offers = (await getMyOffers(teacher.id)).filter((o) => r.offering_ids.includes(o.id));
  return (
    <div className="flex max-w-[680px] flex-col gap-6">
      <Link className="btn3 self-start" href="/teach/requests">
        All requests
      </Link>
      <div className="card flex flex-col gap-2 p-5">
        <h1 className="t2">{r.subject}</h1>
        <p>{r.goal}</p>
        <p className="help">
          {r.budget_max_kes ? <>Budget up to <span className="mono">{formatKES(r.budget_max_kes)}</span> a session. </> : null}
          {r.schedule_notes ?? ""}
        </p>
      </div>
      {r.applied ? (
        <p className="panel">You have already applied to this request.</p>
      ) : (
        <ApplyForm requestId={r.id} offers={offers.map((o) => ({ id: o.id, title: o.title, price: o.price_hour_kes }))} />
      )}
    </div>
  );
}
