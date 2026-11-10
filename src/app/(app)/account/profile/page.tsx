import type { Metadata } from "next";
import { CalendarDays, Mail, MapPin } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { getLearnerProfile } from "@/lib/data/learning";
import { initials } from "@/domain/format";
import { FORMAT_PLURALS, percent } from "@/domain/learning";
import { CATEGORIES } from "@/domain/taxonomy";
import { ProfileForm } from "../forms";

export const metadata: Metadata = { title: "My Profile" };

/** Countries offered for "country of residence": East Africa first, then where Koobi's learners abroad tend to be. */
const COUNTRY_CODES = ["KE", "UG", "TZ", "RW", "BI", "ET", "SS", "SO", "CD", "NG", "GH", "ZA", "EG", "AE", "SA", "QA", "TR", "GB", "DE", "FR", "NL", "SE", "US", "CA", "AU", "IN", "CN"];

/** My Profile: who the learner is, how to reach them, and what they like to learn. */
export default function ProfilePage(props: PageProps<"/account/profile">) {
  return (
    <Guarded next="/account/profile">
      <Profile searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Profile({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, p] = await Promise.all([searchParams, getLearnerProfile()]);
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const codes = p && !COUNTRY_CODES.includes(p.country_code) ? [p.country_code, ...COUNTRY_CODES] : COUNTRY_CODES;
  const countries = codes.map((c) => [c, names.of(c) ?? c] as [string, string]);
  // Completeness counts only what is really filled in.
  const steps = p ? [!!p.name, !!p.phone, !!p.email, ...(p.prefs ? [p.prefs.categories.length > 0, p.prefs.formats.length > 0] : [])] : [];
  const filled = steps.filter(Boolean).length;
  const since = p?.member_since ? new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Africa/Nairobi" }).format(new Date(p.member_since)) : null;
  return (
    <div className="flex max-w-[1080px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="t1">My Profile</h1>
        <p className="text-ink-2">Manage your personal information and learning preferences.</p>
      </div>
      {sp.done === "saved" ? (
        <p className="panel escrow" role="status">
          Saved.
        </p>
      ) : null}
      {p ? (
        <>
          <section className="card flex flex-wrap items-center gap-5 p-5" aria-label="Summary">
            <span className="av lg h-[88px]! w-[88px]! text-[28px]!" aria-hidden="true">
              {initials(p.name ?? "You") || "Y"}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="t2">{p.name ?? "Add your name"}</span>
              {p.email ? (
                <span className="flex items-center gap-2 text-[15px]">
                  <Mail size={16} aria-hidden="true" className="flex-none text-ink-2" />
                  <span className="truncate">{p.email}</span>
                </span>
              ) : null}
              <span className="flex items-center gap-2 text-[15px]">
                <MapPin size={16} aria-hidden="true" className="flex-none text-ink-2" />
                {names.of(p.country_code) ?? p.country_code}
              </span>
              {since ? (
                <span className="flex items-center gap-2 text-[15px]">
                  <CalendarDays size={16} aria-hidden="true" className="flex-none text-ink-2" />
                  Member since {since}
                </span>
              ) : null}
              <div className="mt-1 flex max-w-[420px] items-center gap-3">
                <span className="flex-none text-[14px] font-semibold">
                  Profile complete: <span className="mono">{filled}</span> of <span className="mono">{steps.length}</span>
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-sand" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={filled} aria-label="Profile completeness">
                  <span className="block h-full rounded-full bg-forest" style={{ width: `${percent(filled, steps.length)}%` }} />
                </span>
              </div>
            </div>
          </section>
          <ProfileForm
            name={p.name ?? ""}
            locale={p.locale}
            country={p.country_code}
            countries={countries}
            email={p.email}
            phone={p.phone}
            emailVerified={p.emailVerified}
            phoneVerified={p.phoneVerified}
            prefs={p.prefs}
            categories={CATEGORIES.map((c) => [c.code, c.short])}
            formats={FORMAT_PLURALS.filter(([f]) => f !== "site_visit")}
          />
        </>
      ) : (
        <p className="panel info">Your profile shows here once you are signed in.</p>
      )}
    </div>
  );
}
