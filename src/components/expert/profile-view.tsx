import { Award, BadgeCheck, Briefcase, CalendarClock, Check, Clock, GraduationCap, Handshake, MapPin, ScrollText, Star, Target, UserRound } from "lucide-react";
import { CREDENTIAL_KINDS, audienceLabel, categoryLabel, countryLabel, experienceLabel, groupWeeklyHours } from "@/domain/expert";
import { initials } from "@/domain/format";

/**
 * The expert profile as learners see it. One component draws both the public page and the expert's
 * own preview, so the preview is exactly what will be published.
 */
export type ProfileData = {
  name: string;
  title: string | null;
  photoUrl: string | null;
  /** Address the video plays from, or null when there is none to show. */
  videoSrc: string | null;
  verified: boolean;
  countryCode: string | null;
  experienceBand: string | null;
  bio: string | null;
  achievements: string | null;
  credentials: { title: string; kind: string; issuer: string | null }[];
  category: string | null;
  specialisations: string[];
  audiences: string[];
  languages: string[];
  outcomes: string | null;
  rating: number | null;
  reviewCount: number;
  weeklyHours: { weekday: number; starts: string; ends: string }[];
};

const KIND_ICON = { education: GraduationCap, certification: Award, licence: ScrollText } as const;

function Heading({ id, Icon, children }: { id: string; Icon: typeof UserRound; children: React.ReactNode }) {
  return (
    <h2 id={id} className="h4 flex items-center gap-2.5">
      <Icon size={22} aria-hidden="true" className="flex-none text-orange" />
      {children}
    </h2>
  );
}

/** A small mark on a field whose draft value differs from what is live (preview only). */
function Waiting({ on }: { on?: boolean }) {
  return on ? <span className="pill bg-hi text-ink text-[12px]!">Waiting for review</span> : null;
}

export function ExpertProfile({
  data,
  actions,
  experiences,
  reviews,
  changed,
  showEmpty = false,
}: {
  data: ProfileData;
  /** Buttons under the name: explore, follow, message. */
  actions?: React.ReactNode;
  experiences?: React.ReactNode;
  reviews?: React.ReactNode;
  /** Field names whose value is a draft not yet live (the expert's preview). */
  changed?: Set<string>;
  /** Show sections that have nothing in them yet (the expert's preview). Learners never see an empty section. */
  showEmpty?: boolean;
}) {
  const is = (k: string) => changed?.has(k);
  const country = countryLabel(data.countryCode);
  const experience = experienceLabel(data.experienceBand);
  const points = (data.achievements ?? "").split(/\n+/).map((l) => l.replace(/^[-•*\s]+/, "").trim()).filter(Boolean);
  const hours = groupWeeklyHours(data.weeklyHours);
  const first = data.name.split(" ")[0];

  return (
    <div className="flex flex-col gap-6">
      <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]" aria-labelledby="xp-name">
        {data.videoSrc ? (
          <div className="overflow-hidden rounded-[20px] border-[1.5px] border-ink bg-ink">
            <video className="aspect-video w-full bg-ink" controls preload="none" playsInline poster={data.photoUrl ?? undefined} aria-label={`Introduction video from ${first}`}>
              <source src={data.videoSrc} />
            </video>
          </div>
        ) : null}
        <div className={`flex min-w-0 flex-col gap-4 ${data.videoSrc ? "" : "lg:col-span-2"}`}>
          <div className="flex items-start gap-4">
            {data.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- the expert's own photo, from our storage
              <img src={data.photoUrl} alt={`Photo of ${data.name}`} className="h-[88px] w-[88px] flex-none rounded-full border-[1.5px] border-ink object-cover" />
            ) : (
              <span className="av lg h-[88px]! w-[88px]! flex-none text-[28px]!" aria-hidden="true">
                {initials(data.name)}
              </span>
            )}
            <div className="flex min-w-0 flex-col gap-1.5">
              <h1 id="xp-name" className="d3 flex flex-wrap items-center gap-2">
                {data.name} <Waiting on={is("display_name")} />
              </h1>
              {data.verified ? (
                <span className="badge self-start">
                  <span className="seal" aria-hidden="true" />
                  Koobi Verified Expert
                </span>
              ) : null}
              {data.title ? (
                <p className="flex flex-wrap items-center gap-2 text-[17px] font-semibold">
                  {data.title} <Waiting on={is("headline")} />
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {country ? (
              <span className="pill">
                <MapPin size={16} aria-hidden="true" />
                {country}
              </span>
            ) : null}
            {experience ? (
              <span className="pill">
                <Briefcase size={16} aria-hidden="true" />
                {experience} of professional experience
              </span>
            ) : null}
            <span className="pill">
              <Star size={16} aria-hidden="true" className={data.rating !== null ? "fill-marker text-marker" : ""} />
              {data.rating !== null ? (
                <>
                  <span className="mono">{data.rating.toFixed(1)}</span> (<span className="mono">{data.reviewCount}</span> {data.reviewCount === 1 ? "review" : "reviews"})
                </>
              ) : (
                "No rating yet"
              )}
            </span>
          </div>
          {data.specialisations.length ? (
            <ul className="flex flex-wrap gap-2" aria-label="Specialisations">
              {data.specialisations.slice(0, 5).map((s) => (
                <li key={s} className="pill bg-orange-wash">
                  {s}
                </li>
              ))}
            </ul>
          ) : null}
          {actions}
        </div>
      </section>

      <div className={`grid items-start gap-5 ${points.length || showEmpty ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_280px]" : "lg:grid-cols-[minmax(0,1fr)_280px]"}`}>
        <section className="card flex flex-col gap-3 p-5" aria-labelledby="xp-about">
          <Heading id="xp-about" Icon={UserRound}>
            About me <Waiting on={is("bio")} />
          </Heading>
          {data.bio ? <p className="text-[15px] leading-6 whitespace-pre-line">{data.bio}</p> : <p className="text-ink-2">No biography yet.</p>}
        </section>
        {points.length || showEmpty ? (
        <section className="card r2 flex flex-col gap-3 p-5" aria-labelledby="xp-bg">
          <Heading id="xp-bg" Icon={Briefcase}>
            Professional background <Waiting on={is("achievements") || is("experience_band")} />
          </Heading>
          {points.length ? (
            <ul className="flex flex-col gap-2 text-[15px] leading-5">
              {points.map((p, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <Check size={18} aria-hidden="true" className="mt-0.5 flex-none text-orange" />
                  {p}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-2">Not added yet.</p>
          )}
        </section>
        ) : null}
        <aside className="flex flex-col gap-3 rounded-[20px] bg-forest-wash p-5" aria-labelledby="xp-glance">
          <h2 id="xp-glance" className="h4">
            Expert at a glance
          </h2>
          <ul className="flex flex-col gap-3 text-[15px]">
            <li className="flex items-center gap-2.5">
              <Star size={20} aria-hidden="true" className="flex-none text-orange" />
              {data.rating !== null ? (
                <span>
                  <span className="mono font-semibold">{data.rating.toFixed(1)}</span>, from <span className="mono">{data.reviewCount}</span> {data.reviewCount === 1 ? "review" : "reviews"}
                </span>
              ) : (
                <span>No rating yet</span>
              )}
            </li>
            {data.verified ? (
              <li className="flex items-center gap-2.5">
                <BadgeCheck size={20} aria-hidden="true" className="flex-none text-forest" />
                Koobi Verified Expert
              </li>
            ) : null}
            {experience ? (
              <li className="flex items-center gap-2.5">
                <Briefcase size={20} aria-hidden="true" className="flex-none text-forest" />
                {experience} of experience
              </li>
            ) : null}
            {country ? (
              <li className="flex items-center gap-2.5">
                <MapPin size={20} aria-hidden="true" className="flex-none text-forest" />
                {country}
              </li>
            ) : null}
          </ul>
          <p className="mt-1 flex items-start gap-2.5 border-t border-forest-tint pt-3 text-sm text-forest-ink">
            <Handshake size={20} aria-hidden="true" className="flex-none" />
            <span>
              <b>Learn with confidence.</b> Every expert is vetted and verified by Koobi.
            </span>
          </p>
        </aside>
      </div>

      <section className="card flex flex-col gap-4 p-5" aria-labelledby="xp-cred">
        <Heading id="xp-cred" Icon={BadgeCheck}>
          Verified credentials
        </Heading>
        {data.credentials.length ? (
          <ul className="grid gap-4 sm:grid-cols-2">
            {data.credentials.map((c, i) => {
              const Icon = KIND_ICON[c.kind as keyof typeof KIND_ICON] ?? Award;
              return (
                <li key={`${c.title}-${i}`} className="flex items-start gap-3">
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-orange-wash text-orange-deep" aria-hidden="true">
                    <Icon size={22} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-semibold">{c.title}</span>
                    <span className="text-sm text-ink-2">
                      {CREDENTIAL_KINDS[c.kind as keyof typeof CREDENTIAL_KINDS] ?? c.kind}
                      {c.issuer ? ` · ${c.issuer}` : ""}
                    </span>
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-forest-ink">
                      <span className="seal text-[16px]" aria-hidden="true" />
                      Verified by Koobi
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-ink-2">{first} has no verified qualifications listed. Many experts teach from practical experience.</p>
        )}
      </section>

      <section className="card r3 flex flex-col gap-4 p-5" aria-labelledby="xp-areas">
        <Heading id="xp-areas" Icon={Target}>
          Areas of expertise <Waiting on={is("primary_category") || is("specialisations") || is("audiences") || is("languages") || is("learner_outcomes")} />
        </Heading>
        <dl className="grid gap-x-6 gap-y-4 text-[15px] sm:grid-cols-2 lg:grid-cols-4">
          {data.category || showEmpty ? (
            <div className="flex flex-col gap-1">
              <dt className="text-sm font-semibold">Primary category</dt>
              <dd>{categoryLabel(data.category) ?? "—"}</dd>
            </div>
          ) : null}
          {data.specialisations.length || showEmpty ? (
            <div className="flex flex-col gap-1.5">
              <dt className="text-sm font-semibold">Specialisations</dt>
              <dd className="flex flex-wrap gap-1.5">
                {data.specialisations.length
                  ? data.specialisations.map((sp) => (
                      <span key={sp} className="pill bg-orange-wash">
                        {sp}
                      </span>
                    ))
                  : "—"}
              </dd>
            </div>
          ) : null}
          {data.audiences.length || showEmpty ? (
            <div className="flex flex-col gap-1">
              <dt className="text-sm font-semibold">Who I work with</dt>
              <dd>{data.audiences.length ? data.audiences.map(audienceLabel).join(", ") : "—"}</dd>
            </div>
          ) : null}
          {data.languages.length || showEmpty ? (
            <div className="flex flex-col gap-1">
              <dt className="text-sm font-semibold">Languages of delivery</dt>
              <dd>{data.languages.length ? data.languages.join(" · ") : "—"}</dd>
            </div>
          ) : null}
        </dl>
        {data.outcomes ? (
          <p className="border-t border-dashed border-line-2 pt-3 text-[15px]">
            <span className="font-semibold">What learners achieve: </span>
            {data.outcomes}
          </p>
        ) : null}
      </section>

      {experiences}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {reviews ?? <span />}
        <section className="card flex flex-col gap-3 p-5" aria-labelledby="xp-avail">
          <Heading id="xp-avail" Icon={Clock}>
            Availability
          </Heading>
          {hours.length ? (
            <>
              <p className="text-sm text-ink-2">Choose a learning experience to see the exact times you can book.</p>
              <ul className="flex flex-col gap-2 text-[15px]">
                {hours.map((h) => (
                  <li key={h.days} className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="flex items-center gap-2 font-semibold">
                      <CalendarClock size={18} aria-hidden="true" className="text-ink-2" />
                      {h.days}
                    </span>
                    <span className="mono">{h.hours}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-ink-2">Times are in Nairobi time (EAT).</p>
            </>
          ) : (
            <p className="text-ink-2">Dates and times are listed on each learning experience.</p>
          )}
        </section>
      </div>
    </div>
  );
}
