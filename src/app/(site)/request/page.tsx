import type { Metadata } from "next";
import { Suspense } from "react";
import { RequestForm } from "@/components/request/request-form";
import { readDraft } from "@/components/request/draft";
import { EscrowPanel } from "@/components/ui/trust";
import { Spark } from "@/components/ui/doodles";

export const metadata: Metadata = {
  title: "Request a match",
  description: "Tell us what you need. A person sends you three checked teachers or experts within 24 hours.",
};

export default function RequestPage(props: PageProps<"/request">) {
  return (
    <div className="page-wrap flex flex-wrap items-start gap-x-14 gap-y-8 pt-6 pb-24">
      <section className="flex min-w-0 flex-[1_1_340px] flex-col gap-5" aria-labelledby="req-h">
        <div className="flex items-start gap-2">
          <h1 id="req-h" className="dpage">
            Tell us what you <span className="swash">need.</span>
          </h1>
          <Spark className="spark hide-md flex-none" />
        </div>
        <p className="lead">
          A person reads every request and sends you three teachers or experts who fit, each with their checks and dates,
          within 24 hours.
        </p>
        <ol className="flex flex-col gap-3 text-[16px]">
          {["Send your request. It is free.", "Get three matches, here or on WhatsApp.", "Book a trial with the one you like."].map((s, i) => (
            <li key={s} className="flex items-center gap-3">
              <span className="stepn">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <EscrowPanel />
      </section>
      <section className="card r2 app min-w-0 flex-[1_1_440px] p-6 sm:p-8" aria-label="Request form">
        <Suspense fallback={<div className="skeleton h-[640px]" />}>
          <Form searchParams={props.searchParams} />
        </Suspense>
      </section>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const draft = await readDraft();
  const initial = {
    ...(typeof sp.category === "string" ? { category: sp.category } : {}),
    ...(typeof sp.q === "string" ? { q: sp.q.slice(0, 200) } : {}),
    ...draft,
  };
  return <RequestForm initial={initial} back="/request" />;
}
