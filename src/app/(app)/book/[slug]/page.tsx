import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Guarded } from "@/components/app/shell";
import { serverClient } from "@/lib/supabase/server";
import { getPolicyText } from "@/lib/data/bookings";
import { bookableSlots, CANCELLATION_POLICY_VERSION } from "@/domain/booking";
import { formatKES, formatTime, formatWeekday, formatDuration } from "@/domain/format";
import { OFFER_MODES } from "@/domain/listing-input";
import { BookForm } from "../book-form";

export const metadata: Metadata = { title: "Book a lesson" };

export default function BookPage(props: PageProps<"/book/[slug]">) {
  return (
    <Guarded next="/explore">
      <Book params={props.params} searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Book({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  if (typeof sp.kind === "string" && sp.kind.startsWith("package-")) redirect(`/packages/new?offer=${encodeURIComponent(slug)}`);
  const db = await serverClient();
  const [{ data: offer }, { data: details }, { data: auth }] = await Promise.all([
    db.from("explore_offers").select("*").eq("slug", slug).maybeSingle(),
    db.from("offer_details").select("*").eq("slug", slug).maybeSingle(),
    db.auth.getUser(),
  ]);
  if (!offer || !details) notFound();
  const policy = (await getPolicyText(CANCELLATION_POLICY_VERSION)) ?? "";
  const { data: children } = auth.user
    ? await db.from("learners").select("id, alias").not("guardian_id", "is", null)
    : { data: [] };

  // At most one trial per learner per offer (FR-BOOK-5); the database checks children's trials too.
  const { data: trialOk } = auth.user ? await db.rpc("trial_available", { p_offering: offer.id }) : { data: true };
  const wanted = typeof sp.slot === "string" ? sp.slot : null;
  const slots = bookableSlots(details.next_slots ?? [], new Date());
  const ordered = wanted && slots.includes(wanted) ? [wanted, ...slots.filter((s) => s !== wanted)] : slots;
  const kinds = [
    ...(details.trial_price_kes && trialOk !== false ? [{ value: "trial", label: "Trial lesson", sub: `${formatDuration(offer.duration_minutes)}, half price`, price: formatKES(details.trial_price_kes) }] : []),
    { value: "single", label: "One lesson", sub: formatDuration(offer.duration_minutes), price: formatKES(offer.price_kes) },
  ];
  const wantKind = sp.kind === "single" ? "single" : null;
  const sortedKinds = wantKind ? [...kinds].sort((a) => (a.value === wantKind ? -1 : 1)) : kinds;

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <Link className="btn3 self-start" href={`/offers/${slug}`}>
        Back to the offer
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="t1">Book {offer.teacher_name.split(" ")[0]}</h1>
        <p className="text-ink-2">{offer.title}</p>
      </div>
      <BookForm
        slug={slug}
        kinds={sortedKinds}
        slots={ordered.map((s) => ({ value: s, label: `${formatWeekday(s)} ${formatTime(s)}` }))}
        learners={[{ value: "self", label: "Me" }, ...((children ?? []) as { id: string; alias: string }[]).map((c) => ({ value: c.id, label: c.alias }))]}
        modes={(offer.modes as string[]).filter((m) => m !== "hybrid").map((m) => ({ value: m, label: OFFER_MODES.find(([c]) => c === m)?.[1] ?? m }))}
        policy={policy}
      />
    </div>
  );
}
