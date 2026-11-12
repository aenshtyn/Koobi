import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Clock, Star, Timer, Users } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { StatCard } from "@/components/app/stat-card";
import { getMyOffers, getMyTeacher } from "@/lib/data/listings";
import { getTeachingBookings } from "@/lib/data/bookings";
import { getTeacherReviews } from "@/lib/data/lessons";
import { getEarningsByMonth, monthLabel } from "@/lib/data/earnings";
import { serverClient } from "@/lib/supabase/server";
import { formatKES } from "@/domain/format";
import { humanMinutes } from "@/domain/matching";

export const metadata: Metadata = { title: "Business" };

/** T29: how the expert's teaching is going, from their own bookings, reviews and the ledger. */
export default function BusinessPage() {
  return (
    <Guarded next="/teach/business">
      <Business />
    </Guarded>
  );
}

async function Business() {
  const teacher = await getMyTeacher();
  if (!teacher) {
    return (
      <div className="empty max-w-[560px]">
        <p className="t3">Apply first, then your numbers appear here.</p>
        <Link className="btn" href="/teach/apply">
          Apply to teach
        </Link>
      </div>
    );
  }
  const db = await serverClient();
  const [offers, bookings, reviews, months, speed] = await Promise.all([
    getMyOffers(teacher.id),
    getTeachingBookings(),
    getTeacherReviews(),
    getEarningsByMonth(6),
    db.from("teachers").select("response_median_minutes").eq("id", teacher.id).maybeSingle(),
  ]);
  const delivered = bookings.filter((b) => b.status === "confirmed");
  const learners = new Set(bookings.filter((b) => !["cancelled", "lapsed"].includes(b.status)).map((b) => `${b.learner_alias}|${b.payer_first_name ?? ""}`)).size;
  const minutes = delivered.reduce((s, b) => s + b.duration_minutes, 0);
  const published = reviews.filter((r) => r.status === "published");
  const rating = published.length >= 3 ? published.reduce((s, r) => s + r.rating, 0) / published.length : null;
  const response = (speed.data?.response_median_minutes as number | null | undefined) ?? null;
  const top = Math.max(...months.map((m) => m.net_kes), 1);
  const total = months.reduce((s, m) => s + m.net_kes, 0);
  const perOffer = offers
    .map((o) => ({ o, done: delivered.filter((b) => b.offering_id === o.id).length, all: bookings.filter((b) => b.offering_id === o.id && !["cancelled", "lapsed"].includes(b.status)).length }))
    .filter((x) => x.all > 0)
    .sort((a, b) => b.all - a.all);

  return (
    <div className="flex max-w-[1080px] flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="t1">Business</h1>
        <p className="text-ink-2">How your teaching on Koobi is going. Every figure comes from your own bookings, reviews and payouts.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={CircleCheck} tone="forest" value={delivered.length} label="Lessons delivered" sub={minutes ? `${Math.round((minutes / 60) * 10) / 10} hours taught` : "Confirmed lessons"} />
        <StatCard icon={Users} value={learners} label="Learners" sub="With a paid booking" />
        <StatCard icon={Star} tone="forest" value={rating === null ? "—" : rating.toFixed(1)} label="Rating" sub={rating === null ? `${published.length} of 3 reviews needed to show it` : `From ${published.length} reviews`} href="/teach/reviews" />
        <StatCard icon={Timer} value={response === null ? "—" : humanMinutes(response)} label="Typical response time" sub={response === null ? "Shows after your first answered bookings" : "To paid bookings"} />
      </div>

      <section className="card flex flex-col gap-5 p-5" aria-labelledby="earn-h">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="earn-h" className="t3">
            Earnings by month
          </h2>
          <span className="help">
            Last six months: <span className="mono text-ink">{formatKES(total)}</span> after the fee and tax
          </span>
        </div>
        <ol className="grid grid-cols-6 items-end gap-3" aria-label="Earnings by month">
          {months.map((m) => (
            <li key={m.month} className="flex flex-col items-center gap-2">
              <span className="mono text-[13px] leading-4">{m.net_kes ? formatKES(m.net_kes).replace("KES ", "") : "0"}</span>
              <span className="flex h-36 w-full items-end rounded-[10px] bg-sand" aria-hidden="true">
                <span className="w-full rounded-[10px] bg-orange" style={{ height: `${Math.max(m.net_kes ? 4 : 0, Math.round((m.net_kes / top) * 100))}%` }} />
              </span>
              <span className="text-[14px] font-semibold">{monthLabel(m.month)}</span>
            </li>
          ))}
        </ol>
        <Link className="btn3 self-start" href="/teach/earnings">
          Earnings & Payouts
        </Link>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="per-h">
        <h2 id="per-h" className="t3">
          By learning experience
        </h2>
        {perOffer.length ? (
          <ul className="card flex flex-col divide-y divide-dashed divide-line-2 p-0!">
            {perOffer.map(({ o, done, all }) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <Link className="font-semibold text-ink no-underline hover:underline" href={`/teach/offers/${o.id}`}>
                  {o.title}
                </Link>
                <span className="help">
                  <span className="mono text-ink">{all}</span> {all === 1 ? "booking" : "bookings"} · <span className="mono text-ink">{done}</span> delivered
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">
            <Clock size={24} aria-hidden="true" />
            <p className="font-semibold">No bookings yet.</p>
            <p className="help">Once learners book, you will see which learning experiences bring the most lessons.</p>
          </div>
        )}
      </section>
    </div>
  );
}
