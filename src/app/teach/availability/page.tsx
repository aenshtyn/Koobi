import type { Metadata } from "next";
import Link from "next/link";
import { X } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { ListingPill } from "@/components/app/listing-pill";
import { getMyOffers, getMyTeacher, getWindows } from "@/lib/data/listings";
import { WEEKDAYS } from "@/domain/listing-input";
import { removeWindow } from "../actions";
import { WindowForm } from "../forms";

export const metadata: Metadata = { title: "Availability" };

export default function AvailabilityPage() {
  return (
    <Guarded next="/teach/availability">
      <Availability />
    </Guarded>
  );
}

async function Availability() {
  const teacher = await getMyTeacher();
  if (!teacher) {
    return (
      <div className="empty max-w-[560px]">
        <p className="t3">Apply first, then add the times you can teach.</p>
        <Link className="btn" href="/teach/apply">
          Apply to teach
        </Link>
      </div>
    );
  }
  const offers = (await getMyOffers(teacher.id)).filter((o) => o.format === "one_to_one" && o.listing_status !== "retired");
  const windows = await getWindows(offers.map((o) => o.id));
  return (
    <div className="flex max-w-[860px] flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="t1">Times you can teach</h1>
        <p className="text-ink-2">
          Weekly windows in Nairobi time, per offer. Learners book sessions that fit inside them; booked times disappear automatically.
        </p>
      </div>
      {offers.length ? (
        offers.map((o) => {
          const mine = windows.filter((w) => w.offering_id === o.id);
          return (
            <section key={o.id} className="card flex flex-col gap-4 p-6" aria-labelledby={`o-${o.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id={`o-${o.id}`} className="t3">
                  <Link href={`/teach/offers/${o.id}`}>{o.title}</Link>
                </h2>
                <ListingPill state={o.listing_status} />
              </div>
              {mine.length ? (
                <ul className="flex flex-wrap gap-2">
                  {mine.map((w) => (
                    <li key={w.id} className="pill h-auto! gap-2 py-1.5 pl-3 pr-1">
                      <span>{WEEKDAYS[w.weekday]}</span>
                      <span className="mono">
                        {w.starts}–{w.ends}
                      </span>
                      <form action={removeWindow}>
                        <input type="hidden" name="id" value={w.id} />
                        <button type="submit" className="iconbtn ghost h-8! w-8!" aria-label={`Remove ${WEEKDAYS[w.weekday]} ${w.starts} to ${w.ends}`}>
                          <X size={16} aria-hidden="true" />
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="help">No times yet. Learners cannot pick a slot for this offer until you add some.</p>
              )}
              <WindowForm offeringId={o.id} />
            </section>
          );
        })
      ) : (
        <div className="empty">
          <p className="t3">Create a one-to-one offer first.</p>
          <Link className="btn2" href="/teach/offers/new">
            New offer
          </Link>
        </div>
      )}
    </div>
  );
}
