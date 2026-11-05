import Link from "next/link";
import { BookOpen, Briefcase, Calendar, Clock, Laptop, MapPin, Store, Users } from "lucide-react";
import type { ExploreOffer } from "@/domain/types";
import { FORMATS, categoryByCode } from "@/domain/taxonomy";
import { formatDuration, formatKES, formatWeekday, initials } from "@/domain/format";
import { Badges } from "@/components/ui/trust";
import { StarIcon } from "@/components/ui/doodles";

const RADII = ["", "r2", "r3", "r4"];
const AV = ["", "g", "r", "s"];
const PH = ["warm", "green", "rose", ""];

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export const CATEGORY_ICONS = { briefcase: Briefcase, store: Store, book: BookOpen, laptop: Laptop } as const;

export function avatarTone(slug: string) {
  return AV[hash(slug) % AV.length];
}

export function Rating({ rating, count }: { rating: number | null; count: number }) {
  if (rating === null) return <span className="font-semibold text-ink">New</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <StarIcon />
      <span className="mono text-ink">{rating.toFixed(1)}</span>
      <span>
        · <span className="mono">{count}</span> reviews
      </span>
    </span>
  );
}

function whereLine(o: ExploreOffer) {
  if (o.modes.includes("online") && o.modes.length === 1) return "Online";
  const place = [o.estate, o.county].filter(Boolean).join(", ");
  if (o.modes.includes("online")) return place ? `Online or in ${place}` : "Online or in person";
  return place || "In person";
}

export function whenLine(o: ExploreOffer) {
  switch (o.format) {
    case "one_to_one":
      return o.next_start ? `Next ${formatWeekday(o.next_start)}` : formatDuration(o.duration_minutes);
    case "cohort":
      return `${o.sessions_in_run ?? ""} sessions${o.next_start ? ` · starts ${formatWeekday(o.next_start)}` : ""}`;
    default:
      return o.next_start ? formatWeekday(o.next_start) : formatDuration(o.duration_minutes);
  }
}

export function OfferCard({ offer, index = 0 }: { offer: ExploreOffer; index?: number }) {
  const f = FORMATS[offer.format];
  const cat = categoryByCode(offer.category);
  const Icon = cat ? CATEGORY_ICONS[cat.icon] : Laptop;
  const h = hash(offer.slug);
  return (
    <article className={`ocard lift ${RADII[index % 4]}`}>
      <div className={`ph ${PH[h % PH.length]}`}>
        {offer.teacher_photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={offer.teacher_photo_url} alt="" loading="lazy" />
        ) : (
          <Icon size={30} strokeWidth={1.5} aria-hidden="true" />
        )}
      </div>
      <span className={`tag ${f.tagClass} onph`}>{f.label}</span>
      <div className="body">
        <h3>
          <Link className="ttl" href={`/offers/${offer.slug}`}>
            {offer.title}
          </Link>
        </h3>
        <div className="who">
          <span className={`av sm ${avatarTone(offer.teacher_slug)}`} aria-hidden="true">
            {initials(offer.teacher_name)}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-semibold">{offer.teacher_name}</span>
            <span className="text-xs text-ink-2">{offer.teacher_headline}</span>
          </span>
        </div>
        <Badges badges={offer.badges} small />
        <div className="meta">
          <span>
            <Rating rating={offer.rating_avg} count={offer.review_count} />
          </span>
          <span>
            {offer.format === "one_to_one" ? <Clock size={15} aria-hidden="true" /> : <Calendar size={15} aria-hidden="true" />}
            {offer.format === "one_to_one" ? `${formatDuration(offer.duration_minutes)}` : whenLine(offer)}
          </span>
          <span>
            {offer.modes.includes("in_person") ? <MapPin size={15} aria-hidden="true" /> : <Laptop size={15} aria-hidden="true" />}
            {whereLine(offer)}
          </span>
          {offer.seats_left !== null && offer.format !== "one_to_one" ? (
            <span>
              <Users size={15} aria-hidden="true" />
              <span className="mono">{offer.seats_left}</span> seats left
            </span>
          ) : null}
        </div>
        <div className="foot">
          <span>
            <span className="price">{formatKES(offer.price_kes)}</span>
            <span className="unit">{f.unit}</span>
          </span>
          <Link className="opill" href={`/offers/${offer.slug}`} aria-label={`Book ${offer.title}`}>
            Book
          </Link>
        </div>
      </div>
    </article>
  );
}
