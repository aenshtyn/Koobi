import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Guarded } from "@/components/app/shell";
import { getOfferPage } from "@/lib/data/catalogue";
import { serverClient } from "@/lib/supabase/server";
import { getMyPackage } from "@/lib/data/account";
import { formatKES } from "@/domain/format";
import { NewPackageForm } from "../forms";

export const metadata: Metadata = { title: "Package" };

/** L9: 8, 12 or 16 lessons at the package price (FR-BOOK-6). */
export default function NewPackagePage(props: PageProps<"/packages/new">) {
  return (
    <Guarded next="/explore">
      <NewPackage searchParams={props.searchParams} />
    </Guarded>
  );
}

async function NewPackage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const slug = typeof sp.offer === "string" ? sp.offer : "";
  const page = slug ? await getOfferPage(slug) : null;
  if (!page || page.offer.format !== "one_to_one") notFound();
  const { offer, details } = page;
  const listed = details?.package_prices ?? [];
  const prices = new Map(listed.map((p) => [p.sessions, p.price_kes]));
  // The expert's own packages replace the standard sizes.
  const own = listed.filter((p) => p.name);
  const sizes = own.length
    ? own.map((p) => {
        const each = Math.round(p.price_kes / p.sessions);
        return {
          sessions: p.sessions,
          label: `${p.name} · ${p.sessions} lessons · ${formatKES(p.price_kes)} (${formatKES(each)} each)${p.validity_weeks ? ` · use within ${p.validity_weeks} weeks` : ""}`,
        };
      })
    : [8, 12, 16].map((n) => {
        const price = prices.get(n) ?? offer.price_kes * n;
        const each = Math.round(price / n);
        return { sessions: n, label: `${n} lessons · ${formatKES(price)} (${formatKES(each)} each${each < offer.price_kes ? ", package price" : ""})` };
      });
  const db = await serverClient();
  const renew = typeof sp.renew === "string" ? await getMyPackage(sp.renew) : null;
  const { data: children } = await db.from("learners").select("id, alias, consent_status").not("guardian_id", "is", null);
  const learners = renew
    ? [{ value: renew.pkg.learner_id, label: renew.pkg.learner?.alias ?? "Same learner" }]
    : [{ value: "self", label: "Me" }, ...((children ?? []) as { id: string; alias: string; consent_status: string }[]).filter((c) => c.consent_status === "active").map((c) => ({ value: c.id, label: c.alias }))];
  return (
    <div className="flex max-w-[620px] flex-col gap-6">
      <Link className="btn3 self-start" href={`/offers/${offer.slug}`}>
        Back to the learning experience
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="t1">{renew ? "Renew the package" : "A package of lessons"}</h1>
        <p className="text-ink-2">
          {offer.title} with {offer.teacher_name}
        </p>
      </div>
      <NewPackageForm offeringId={offer.id} sizes={sizes} learners={learners} previousId={renew?.pkg.id} cta="Continue to payment" />
    </div>
  );
}
