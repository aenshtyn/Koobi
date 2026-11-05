import type { Metadata } from "next";
import { Suspense } from "react";
import { Guarded } from "@/components/app/shell";
import { ListingPill } from "@/components/app/listing-pill";
import { getCounties, getPendingListings } from "@/lib/data/listings";
import { getSessionUser } from "@/lib/auth";
import { categoryByCode } from "@/domain/taxonomy";
import { formatDate, formatKES } from "@/domain/format";
import { EMPLOYMENT, LANGUAGES, MEETING_TOOLS, OFFER_MODES, PRICE_BANDS, TEACHER_TYPES, blocksSubmission, sessionPrice } from "@/domain/listing-input";
import { STAFF_ROLES } from "@/lib/auth";
import { Decide } from "./decide";

export const metadata: Metadata = { title: "Listing approvals", robots: { index: false } };

const label = <T extends readonly (readonly [string, string])[]>(list: T, code: string | null) => list.find(([c]) => c === code)?.[1] ?? code ?? "—";

export default function ListingsPage(props: PageProps<"/staff/listings">) {
  return (
    <Guarded next="/staff/listings" anyOf={STAFF_ROLES}>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="t1">Listing approvals</h1>
          <p className="text-ink-2">
            Profiles and offers waiting for a decision, oldest first. Target: two working days. An offer shows on Explore only when its
            teacher&rsquo;s profile is approved too.
          </p>
        </div>
        <Suspense fallback={null}>
          <Done searchParams={props.searchParams} />
        </Suspense>
        <Queue />
      </div>
    </Guarded>
  );
}

async function Done({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { done } = await searchParams;
  if (!done) return null;
  return (
    <div className="panel escrow items-center" role="status">
      <span className="seal" aria-hidden="true" />
      <p>{done === "approved" ? "Approved. It is live on Explore if its teacher is approved too." : "Sent back with your note."}</p>
    </div>
  );
}

async function Queue() {
  const [{ teachers, offers }, counties, user] = await Promise.all([getPendingListings(), getCounties(), getSessionUser()]);
  const canDecide = !!user?.roles.some((r) => r === "reviewer" || r === "admin");
  return (
    <>
      {!canDecide ? (
        <div className="panel info" role="note">
          <p>You can see the queue. Approving and rejecting needs the reviewer or admin role.</p>
        </div>
      ) : null}

      <section className="flex flex-col gap-4" aria-labelledby="t-h">
        <h2 id="t-h" className="t2">
          Profiles <span className="mono text-[16px] text-ink-2">{teachers.length}</span>
        </h2>
        {teachers.length ? (
          teachers.map((t) => (
            <article key={t.id} className="card flex flex-col gap-4 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h3 className="t3">{t.display_name}</h3>
                  <p>{t.headline}</p>
                </div>
                <span className="help">
                  Sent <span className="mono">{t.submitted_at ? formatDate(t.submitted_at) : "—"}</span>
                </span>
              </div>
              <dl className="grid gap-x-6 gap-y-2 text-[15px] sm:grid-cols-2">
                <div><dt className="help">Type</dt><dd>{label(TEACHER_TYPES, t.teacher_type)}</dd></div>
                <div>
                  <dt className="help">Employment</dt>
                  <dd className={blocksSubmission(t.employment_status) ? "font-semibold text-error" : ""}>{label(EMPLOYMENT, t.employment_status)}</dd>
                </div>
                <div><dt className="help">County</dt><dd>{counties.find((c) => c.code === t.county_code)?.label ?? "—"}</dd></div>
                <div><dt className="help">Languages</dt><dd>{t.languages.map((l) => label(LANGUAGES, l)).join(", ")}</dd></div>
                <div><dt className="help">Tracks</dt><dd>{t.tracks.join(", ") || "—"}</dd></div>
                <div>
                  <dt className="help">Declared</dt>
                  <dd className="mono">{t.employment_declared_at ? formatDate(t.employment_declared_at) : "—"}</dd>
                </div>
              </dl>
              <p className="whitespace-pre-line text-ink-2">{t.bio}</p>
              {canDecide ? <Decide kind="teacher" id={t.id} label="profile" /> : null}
            </article>
          ))
        ) : (
          <p className="help">No profiles waiting.</p>
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="o-h">
        <h2 id="o-h" className="t2">
          Offers <span className="mono text-[16px] text-ink-2">{offers.length}</span>
        </h2>
        {offers.length ? (
          offers.map((o) => {
            const band = PRICE_BANDS[o.track as keyof typeof PRICE_BANDS];
            const outOfBand = band && o.price_hour_kes !== null && (o.price_hour_kes < band.min || o.price_hour_kes > band.max);
            return (
              <article key={o.id} className="card r2 flex flex-col gap-4 p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <h3 className="t3">{o.title}</h3>
                    <p className="help">
                      by {o.teacher?.display_name ?? "—"} · {categoryByCode(o.category)?.label} · {o.track}
                    </p>
                  </div>
                  {o.teacher ? (
                    <span className="flex items-center gap-2 text-sm">
                      Profile <ListingPill state={o.teacher.listing_status} />
                    </span>
                  ) : null}
                </div>
                <p>{o.summary}</p>
                <dl className="grid gap-x-6 gap-y-2 text-[15px] sm:grid-cols-2">
                  <div>
                    <dt className="help">Price</dt>
                    <dd className={outOfBand ? "font-semibold text-error" : ""}>
                      <span className="mono">{o.price_hour_kes ? formatKES(o.price_hour_kes) : "—"}</span> per hour ·{" "}
                      <span className="mono">{o.price_hour_kes ? formatKES(sessionPrice(o.price_hour_kes, o.duration_minutes)) : "—"}</span> per{" "}
                      <span className="mono">{o.duration_minutes}</span>-minute session
                    </dd>
                  </div>
                  <div><dt className="help">Trial</dt><dd>{o.trial_discount_pct ? `Yes, ${o.trial_discount_pct}% off` : "No"}</dd></div>
                  <div><dt className="help">Where</dt><dd>{o.modes.map((m) => label(OFFER_MODES, m)).join(", ")}{o.meeting_tool ? ` · ${MEETING_TOOLS[o.meeting_tool as keyof typeof MEETING_TOOLS] ?? o.meeting_tool}` : ""}</dd></div>
                  <div><dt className="help">Subject</dt><dd>{o.subject_text ?? "—"}</dd></div>
                </dl>
                {o.description ? <p className="whitespace-pre-line text-ink-2">{o.description}</p> : null}
                {o.outcomes.length ? (
                  <ul className="list-disc pl-5 text-[15px]">
                    {o.outcomes.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                ) : null}
                {canDecide ? <Decide kind="offer" id={o.id} label="offer" /> : null}
              </article>
            );
          })
        ) : (
          <p className="help">No offers waiting.</p>
        )}
      </section>
    </>
  );
}
