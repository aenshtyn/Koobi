import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { ListingPill } from "@/components/app/listing-pill";
import { getMyOffer, getMyTeacher } from "@/lib/data/listings";
import { formatDate } from "@/domain/format";
import { blocksSubmission } from "@/domain/listing-input";
import { deleteOffer, setOfferPaused } from "../../actions";
import { OfferForm } from "../../forms";

export const metadata: Metadata = { title: "Edit offer" };

export default function EditOfferPage(props: PageProps<"/teach/offers/[id]">) {
  return (
    <Guarded next="/teach/offers">
      <EditOffer params={props.params} searchParams={props.searchParams} />
    </Guarded>
  );
}

async function EditOffer({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp, teacher] = await Promise.all([params, searchParams, getMyTeacher()]);
  const offer = await getMyOffer(id);
  if (!offer || !teacher) notFound();
  const initial = {
    id: offer.id,
    title: offer.title,
    summary: offer.summary,
    description: offer.description,
    outcomes: offer.outcomes.join("\n"),
    category: offer.category,
    kind: offer.track,
    subject_text: offer.subject_text,
    curriculum_code: offer.curriculum_code,
    goal: offer.goal,
    modes: offer.modes,
    meeting_tool: offer.meeting_tool,
    duration_minutes: String(offer.duration_minutes),
    price_hour_kes: offer.price_hour_kes ? String(offer.price_hour_kes) : "",
    trial: offer.trial_discount_pct ? "on" : "",
    language_codes: offer.language_codes,
  };
  const blocked = blocksSubmission(teacher.employment_status);
  return (
    <div className="flex max-w-[760px] flex-col gap-8">
      {sp.saved ? (
        <div className="panel escrow items-center" role="status">
          <span className="seal" aria-hidden="true" />
          <p>{sp.saved === "submitted" ? <><b>Sent for review.</b> We usually decide within two working days.</> : <><b>Draft saved.</b></>}</p>
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <ListingPill state={offer.listing_status} />
          {offer.submitted_at && offer.listing_status === "pending_review" ? (
            <span className="help">
              Sent <span className="mono">{formatDate(offer.submitted_at)}</span>
            </span>
          ) : null}
        </div>
        <h1 className="t1">{offer.title}</h1>
        {offer.listing_status === "rejected" && offer.rejection_reason ? (
          <div className="panel error" role="alert">
            <p>
              <b>Changes needed:</b> {offer.rejection_reason}
            </p>
          </div>
        ) : null}
        {blocked ? <p className="help">Full-time TSC teachers cannot list offers, so this stays a draft.</p> : null}
        {offer.listing_status === "approved" ? (
          teacher.listing_status === "approved" ? (
            <Link className="btn3 self-start" href={`/offers/${offer.slug}`}>
              See it on Explore <ExternalLink size={16} aria-hidden="true" />
            </Link>
          ) : (
            <p className="help">Approved. It appears on Explore once your profile is approved too.</p>
          )
        ) : null}
        <div className="flex flex-wrap gap-3">
          {offer.listing_status === "approved" || offer.listing_status === "paused" ? (
            <form action={setOfferPaused}>
              <input type="hidden" name="id" value={offer.id} />
              <input type="hidden" name="to" value={offer.listing_status === "approved" ? "paused" : "approved"} />
              <button className="btn2 ink" type="submit">
                {offer.listing_status === "approved" ? "Pause" : "Resume"}
              </button>
            </form>
          ) : null}
          {offer.listing_status === "draft" ? (
            <form action={deleteOffer}>
              <input type="hidden" name="id" value={offer.id} />
              <button className="btn3" type="submit">
                Delete draft
              </button>
            </form>
          ) : null}
          <Link className="btn3" href="/teach/availability">
            Times you can teach
          </Link>
        </div>
      </div>
      <Suspense fallback={null}>
        <OfferForm initial={initial} live={offer.listing_status === "approved"} />
      </Suspense>
    </div>
  );
}
