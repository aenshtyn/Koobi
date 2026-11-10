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
import { getOpenRuns } from "@/lib/data/runs";
import { FORMATS, type FormatCode } from "@/domain/taxonomy";

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

  const learners = [{ value: "self", label: "Me" }, ...((children ?? []) as { id: string; alias: string }[]).map((c) => ({ value: c.id, label: c.alias }))];
  const modes = (offer.modes as string[]).filter((m) => m !== "hybrid").map((m) => ({ value: m, label: OFFER_MODES.find(([c]) => c === m)?.[1] ?? m }));

  // A group: choose one of its dates and book a seat, paid in full.
  if (offer.format !== "one_to_one") {
    const runs = await getOpenRuns(offer.id);
    const wantRun = typeof sp.run === "string" ? sp.run : null;
    const sorted = wantRun ? [...runs].sort((a) => (a.id === wantRun ? -1 : 1)) : runs;
    const price = runs[0]?.price_kes ?? offer.price_kes;
    return (
      <div className="flex max-w-[720px] flex-col gap-6">
        <Link className="btn3 self-start" href={`/offers/${slug}`}>
          Back to the learning experience
        </Link>
        <div className="flex flex-col gap-1">
          <h1 className="t1">{offer.format === "cohort" ? "Join the programme" : "Book a seat"}</h1>
          <p className="text-ink-2">
            {offer.title} with {offer.teacher_name}
          </p>
        </div>
        <BookForm
          slug={slug}
          kinds={[{ value: "seat", label: `A seat in this ${(FORMATS[offer.format as FormatCode]?.label ?? "group").toLowerCase()}`, sub: "Paid in full when you book. If too few people book, you get it all back as credit.", price: formatKES(price) }]}
          slots={sorted.map((r) => ({
            value: r.id,
            label: `${formatWeekday(r.starts_at)} ${formatTime(r.starts_at)} · ${r.session_starts.length > 1 ? `${r.session_starts.length} weekly sessions` : formatDuration(r.duration_minutes)} · ${r.seats_left} ${r.seats_left === 1 ? "seat" : "seats"} left`,
          }))}
          slotLegend={offer.format === "workshop" ? "Date (Nairobi time)" : "Starts on (Nairobi time)"}
          noSlots="No dates are open for booking right now. Message the teacher, or check back soon."
          learners={learners}
          modes={modes}
          policy={policy}
        />
      </div>
    );
  }

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
        Back to the learning experience
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="t1">Book {offer.teacher_name.split(" ")[0]}</h1>
        <p className="text-ink-2">{offer.title}</p>
      </div>
      <BookForm
        slug={slug}
        kinds={sortedKinds}
        slots={ordered.map((s) => ({ value: s, label: `${formatWeekday(s)} ${formatTime(s)}` }))}
        learners={learners}
        modes={modes}
        policy={policy}
      />
    </div>
  );
}
