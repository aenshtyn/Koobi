import type { Metadata } from "next";
import { RichText } from "@/components/ui/rich-text";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CalendarDays, ChevronRight, Clock, Globe, Languages, Laptop, MapPin, NotebookPen, Timer, Users } from "lucide-react";
import { FORMATS, categoryByCode, isInPerson, isOnline } from "@/domain/taxonomy";
import { formatDate, formatDuration, formatKES, formatTime, formatWeekday, initials } from "@/domain/format";
import { getOfferPage } from "@/lib/data/catalogue";
import { CATEGORY_ICONS, Rating, avatarTone } from "@/components/site/offer-card";
import { BlockSkeleton } from "@/components/site/skeletons";
import { Badges, CheckLedger, EscrowPanel, Seal } from "@/components/ui/trust";
import { Spark, Tick } from "@/components/ui/doodles";
import type { OfferPage as OfferPageData } from "@/lib/data/catalogue";
import { brand } from "@/config/brand";

export async function generateMetadata(props: PageProps<"/offers/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const data = await getOfferPage(slug);
  if (!data) return { title: "Learning experience not found" };
  return { title: data.offer.title, description: data.offer.summary };
}

export default function OfferPage(props: PageProps<"/offers/[slug]">) {
  return (
    <Suspense
      fallback={
        <div className="page-wrap flex flex-col gap-6 pt-4 pb-24">
          <BlockSkeleton className="h-[260px]" />
          <BlockSkeleton className="h-[520px]" />
        </div>
      }
    >
      <Offer params={props.params} />
    </Suspense>
  );
}

function responseLine(minutes: number | null) {
  if (minutes === null) return null;
  if (minutes <= 90) return "Usually replies within an hour";
  if (minutes <= 300) return `Usually replies within ${Math.round(minutes / 60)} hours`;
  return "Usually replies the same day";
}

async function Offer({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getOfferPage(slug);
  if (!data) notFound();
  const { offer, details, teacher } = data;
  const fmt = FORMATS[offer.format];
  const cat = categoryByCode(offer.category);
  const CatIcon = cat ? CATEGORY_ICONS[cat.icon] : Laptop;
  const firstCheck = offer.badges[0];
  const online = isOnline(offer.modes);
  const place = [offer.estate, offer.county].filter(Boolean).join(", ");

  return (
    <>
      <div className="page-wrap pt-2 pb-5">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/explore">Explore</Link>
          <ChevronRight size={16} aria-hidden="true" />
          {cat ? (
            <>
              <Link href={`/explore/${cat.slug}`}>{cat.label}</Link>
              <ChevronRight size={16} aria-hidden="true" />
            </>
          ) : null}
          <span aria-current="page" className="text-ink">
            {offer.title}
          </span>
        </nav>
      </div>

      <div className="page-wrap">
        <div className="ph warm drawn relative h-[200px] rounded-[28px_36px_24px_40px] md:h-[240px]">
          {offer.teacher_photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={offer.teacher_photo_url} alt={`${offer.teacher_name}`} />
          ) : (
            <CatIcon size={40} strokeWidth={1.4} aria-hidden="true" />
          )}
          <span className={`tag lg ${fmt.tagClass} onph`}>{fmt.label}</span>
          {firstCheck ? (
            <span className="floatcard bottom-4 left-4 px-3.5 py-2.5" style={{ transform: "rotate(-1.5deg)" }}>
              <Badges badges={[firstCheck]} long />
            </span>
          ) : null}
        </div>
      </div>

      <div className="page-wrap flex flex-wrap items-start gap-x-12 gap-y-10 pt-10 pb-24">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-11">
          <section className="flex flex-col gap-3.5" aria-labelledby="offer-h">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`tag ${fmt.tagClass}`}>{fmt.label}</span>
              {cat ? (
                <Link className="pill" href={`/explore/${cat.slug}`}>
                  {cat.label}
                </Link>
              ) : null}
            </div>
            <div className="flex items-start gap-2.5">
              <h1 id="offer-h" className="dpage max-w-[680px]">
                {offer.title}
              </h1>
              <Spark className="spark hide-md flex-none" style={{ transform: "rotate(10deg)" }} />
            </div>
            <p className="lead max-w-[640px]">{offer.summary}</p>
            <div className="flex flex-wrap items-center gap-x-[18px] gap-y-1.5 text-sm text-ink-2">
              <Rating rating={offer.rating_avg} count={offer.review_count} />
              <span className="inline-flex items-center gap-1.5">
                <Clock size={16} aria-hidden="true" />
                {formatDuration(offer.duration_minutes)}
                {offer.sessions_in_run && offer.sessions_in_run > 1 ? ` × ${offer.sessions_in_run} sessions` : ""}
              </span>
              <span className="inline-flex items-center gap-1.5">
                {online ? <Laptop size={16} aria-hidden="true" /> : <MapPin size={16} aria-hidden="true" />}
                {online ? `Online${details?.meeting_tool ? ` · ${details.meeting_tool}` : ""}` : place || "In person"}
                {online && isInPerson(offer.modes) && place ? ` or in ${place}` : ""}
              </span>
            </div>
          </section>

          <section className="card flex flex-wrap gap-5 p-6" aria-labelledby="exp-h">
            <span className={`av lg ${avatarTone(offer.teacher_slug)}`} aria-hidden="true">
              {initials(offer.teacher_name)}
            </span>
            <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <h2 id="exp-h" className="d3">
                  {offer.teacher_name}
                </h2>
                <p>{offer.teacher_headline}</p>
              </div>
              <CheckLedger badges={offer.badges} />
              <div className="flex flex-wrap gap-2">
                {details?.languages.length ? (
                  <span className="pill">
                    <Languages size={16} aria-hidden="true" />
                    {details.languages.join(", ")}
                  </span>
                ) : null}
                {teacher && responseLine(teacher.response_time_minutes) ? (
                  <span className="pill">
                    <Timer size={16} aria-hidden="true" />
                    {responseLine(teacher.response_time_minutes)}
                  </span>
                ) : null}
              </div>
              <Link className="more self-start" href={`/teachers/${offer.teacher_slug}`}>
                See {offer.teacher_name.split(" ")[0]}&rsquo;s profile
              </Link>
            </div>
          </section>

          {details?.description ? (
            <section className="flex flex-col gap-4" aria-labelledby="about-h">
              <h2 id="about-h" className="mk md">
                About this <span className="hl">experience</span>
              </h2>
              <RichText text={details.description} className="max-w-[68ch] text-[17px] leading-[27px]" />
            </section>
          ) : null}

          {details?.outcomes.length ? (
            <section className="flex flex-col gap-4" aria-labelledby="work-h">
              <h2 id="work-h" className="mk md">
                What you will <span className="hl">work on</span>
              </h2>
              <ul className="card r2 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-6 gap-y-3.5 p-6">
                {details.outcomes.map((o) => (
                  <li key={o} className="flex items-start gap-3">
                    <Tick style={{ marginTop: 2 }} />
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="flex flex-col gap-4" aria-labelledby="runs-h">
            <h2 id="runs-h" className="mk md">
              How it <span className="hl t2">runs</span>
            </h2>
            <ul className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <li className="card flex flex-col gap-3 p-[18px]">
                <span className="tile h-[46px] w-[46px] bg-paper">
                  {online ? <Laptop size={22} aria-hidden="true" /> : <MapPin size={22} aria-hidden="true" />}
                </span>
                <span className="text-[15px] leading-[22px]">
                  <span className="mono">{offer.duration_minutes}</span>-minute {online ? "live sessions" : "sessions"}
                  {online && details?.meeting_tool ? ` on ${details.meeting_tool}` : place ? ` in ${place}` : ""}
                </span>
              </li>
              <li className="card r3 flex flex-col gap-3 p-[18px]">
                <span className="tile h-[46px] w-[46px] bg-paper">
                  <Users size={22} aria-hidden="true" />
                </span>
                <span className="text-[15px] leading-[22px]">
                  {offer.format === "one_to_one"
                    ? "Just you and your expert"
                    : offer.seats_left !== null
                      ? <><span className="mono">{offer.seats_left}</span> seats left</>
                      : "A small group"}
                </span>
              </li>
              <li className="card r4 flex flex-col gap-3 p-[18px]">
                <span className="tile h-[46px] w-[46px] bg-paper">
                  <NotebookPen size={22} aria-hidden="true" />
                </span>
                <span className="text-[15px] leading-[22px]">A note after every session</span>
              </li>
            </ul>
          </section>

          {details?.next_slots.length ? (
            <section className="flex flex-col gap-4" aria-labelledby="times-h">
              <h2 id="times-h" className="mk md">
                Next <span className="hl">times</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {details.next_slots.map((s) => (
                  <Link key={s} className="chip" href={`/book/${offer.slug}?slot=${encodeURIComponent(s)}`}>
                    <CalendarDays size={16} aria-hidden="true" />
                    <span className="mono">
                      {formatWeekday(s)} {formatTime(s)}
                    </span>
                  </Link>
                ))}
              </div>
              <p className="text-xs text-ink-2">Nairobi time.</p>
            </section>
          ) : null}

          <Reviews data={data} />
        </div>

        <BookingCard data={data} />
      </div>

      <div className="sticky bottom-0 z-20 border-t-[1.5px] border-ink bg-card lg:hidden">
        <div className="page-wrap flex items-center justify-between gap-3 py-3">
          <span>
            <span className="price">{formatKES(offer.price_kes)}</span> <span className="unit">{fmt.unit}</span>
          </span>
          <a className="opill" href="#book">
            Choose and book
          </a>
        </div>
      </div>
    </>
  );
}

function Reviews({ data }: { data: OfferPageData }) {
  const { offer, reviews } = data;
  return (
    <section className="flex flex-col gap-4" aria-labelledby="rev-h">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
        <h2 id="rev-h" className="mk md">
          <span className="hl t2">Reviews</span>
        </h2>
        <span className="text-sm text-ink-2">
          <Rating rating={offer.rating_avg} count={offer.review_count} />
        </span>
      </div>
      {offer.rating_avg !== null && reviews.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {reviews.slice(0, 6).map((r, i) => (
            <figure key={`${r.created_at}-${i}`} className={`card ${["", "r2", "r3"][i % 3]} flex flex-col gap-3 p-5`}>
              <blockquote className="text-[15px] leading-[22px]">{r.body}</blockquote>
              <figcaption className="mt-auto flex items-center gap-2.5">
                <span className={`av sm ${["g", "r", "s"][i % 3]}`} aria-hidden="true">
                  {r.reviewer_first_name[0]}
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">{r.reviewer_first_name}</span>
                  <span className="mono text-xs text-ink-2">{formatDate(r.created_at)}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="text-ink-2">
          New on {brand.name}. Reviews appear here only from learners who completed a paid lesson.
        </p>
      )}
      <div className="panel mt-2 items-center">
        <Seal />
        <p>Not the right fit? We will match a replacement at no extra cost.</p>
      </div>
    </section>
  );
}

function BookingCard({ data }: { data: OfferPageData }) {
  const { offer, details } = data;
  const fmt = FORMATS[offer.format];
  const options: { id: string; label: string; sub: string; price: number; note?: string }[] = [];
  if (offer.format === "one_to_one") {
    if (details?.trial_price_kes) {
      options.push({
        id: "trial",
        label: "Trial session",
        sub: formatDuration(offer.duration_minutes),
        price: details.trial_price_kes,
        note: details.trial_price_kes * 2 === offer.price_kes ? "Half the session price" : "Trial price",
      });
    }
    options.push({ id: "single", label: "One session", sub: formatDuration(offer.duration_minutes), price: offer.price_kes });
    for (const p of details?.package_prices ?? []) {
      options.push({
        id: `package-${p.sessions}`,
        label: p.name ? `${p.name} · ${p.sessions} sessions` : `${p.sessions} sessions`,
        sub: `${formatKES(Math.round(p.price_kes / p.sessions))} each${p.validity_weeks ? ` · use within ${p.validity_weeks} weeks` : ""}`,
        price: p.price_kes,
      });
    }
  }
  const cta = offer.format === "one_to_one" ? (options[0]?.id === "trial" ? "Book a trial session" : "Book a session") : offer.format === "cohort" ? "Join the programme" : "Book a seat";

  return (
    <aside id="book" className="flex min-w-0 flex-[1_1_340px] scroll-mt-6 flex-col gap-4 lg:sticky lg:top-6" aria-label="Price and booking">
      <form className="card r2 flex flex-col gap-[18px] p-6" action={`/book/${offer.slug}`}>
        <p className="flex items-baseline gap-1.5">
          <span className="price-xl">{formatKES(offer.price_kes)}</span>
          <span className="unit text-[15px]">{fmt.unit}</span>
        </p>
        {options.length ? (
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="sr-only">Choose what to book</legend>
            {options.map((o, i) => (
              <label key={o.id} className="option">
                <input type="radio" name="kind" value={o.id} defaultChecked={i === 0} />
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className="font-semibold">{o.label}</span>
                  <span className="text-xs text-ink-2">{o.sub}</span>
                  {o.note ? (
                    <span className="note mt-1 origin-left -rotate-2 text-[17px] leading-5">{o.note}</span>
                  ) : null}
                </span>
                <span className="price">{formatKES(o.price)}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <div className="flex flex-col gap-1 text-[15px]">
            {offer.next_start ? (
              <span className="inline-flex items-center gap-2">
                <CalendarDays size={18} aria-hidden="true" />
                <span>
                  {offer.format === "cohort" ? "Starts " : ""}
                  <span className="mono">
                    {formatWeekday(offer.next_start)} {formatTime(offer.next_start)}
                  </span>
                </span>
              </span>
            ) : null}
            {offer.seats_left !== null ? (
              <span className="inline-flex items-center gap-2">
                <Users size={18} aria-hidden="true" />
                <span>
                  <span className="mono">{offer.seats_left}</span> seats left
                </span>
              </span>
            ) : null}
            {isOnline(offer.modes) ? (
              <span className="inline-flex items-center gap-2">
                <Globe size={18} aria-hidden="true" />
                Online
              </span>
            ) : null}
          </div>
        )}
        <button type="submit" className="btn block lg">
          {cta}
        </button>
        <p className="text-center text-sm text-ink-2">Pay only when the lesson happens.</p>
        <p className="text-center text-xs text-ink-2">
          Free cancellation or reschedule up to <span className="mono">24</span> hours before.
        </p>
      </form>
      {offer.format === "one_to_one" && !details?.package_prices?.length ? (
        <a className="btn3 self-center" href={`/packages/new?offer=${offer.slug}`}>
          Or book 8, 12 or 16 lessons as a package
        </a>
      ) : null}
      <EscrowPanel who={offer.teacher_name} />
    </aside>
  );
}
