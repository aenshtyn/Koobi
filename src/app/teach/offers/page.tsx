import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { ListingPill } from "@/components/app/listing-pill";
import { getMyOffers, getMyTeacher } from "@/lib/data/listings";
import { categoryByCode } from "@/domain/taxonomy";
import { formatKES } from "@/domain/format";
import { sessionPrice } from "@/domain/listing-input";

export const metadata: Metadata = { title: "My offers" };

export default function OffersPage() {
  return (
    <Guarded next="/teach/offers">
      <Offers />
    </Guarded>
  );
}

async function Offers() {
  const teacher = await getMyTeacher();
  if (!teacher) {
    return (
      <div className="empty max-w-[560px]">
        <p className="t3">Apply first, then create offers.</p>
        <Link className="btn" href="/teach/apply">
          Apply to teach
        </Link>
      </div>
    );
  }
  const offers = await getMyOffers(teacher.id);
  return (
    <div className="flex max-w-[960px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="t1">My offers</h1>
          <p className="text-ink-2">Each offer is reviewed before it appears on Explore. Group classes and workshops arrive with group runs.</p>
        </div>
        <Link className="btn" href="/teach/offers/new">
          <Plus size={18} aria-hidden="true" />
          New offer
        </Link>
      </div>
      {offers.length ? (
        <div className="overflow-x-auto">
          <table className="table-k min-w-[640px]">
            <thead>
              <tr>
                <th scope="col">Offer</th>
                <th scope="col">Category</th>
                <th scope="col">Per session</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link className="font-semibold" href={`/teach/offers/${o.id}`}>
                      {o.title}
                    </Link>
                    {o.listing_status === "rejected" && o.rejection_reason ? <p className="help">{o.rejection_reason}</p> : null}
                  </td>
                  <td className="text-ink-2">{categoryByCode(o.category)?.short}</td>
                  <td className="mono">{o.price_hour_kes ? formatKES(sessionPrice(o.price_hour_kes, o.duration_minutes)) : "—"}</td>
                  <td>
                    <ListingPill state={o.listing_status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <p className="t3">Create your first offer.</p>
          <p className="help">One offer is one thing you teach, at one price. You can have several.</p>
        </div>
      )}
    </div>
  );
}
