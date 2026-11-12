import type { Metadata } from "next";
import { Suspense } from "react";
import { RequestForm } from "@/components/request/request-form";
import { EscrowPanel } from "@/components/ui/trust";
import { Spark } from "@/components/ui/doodles";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Request a match",
  description: "Tell us what you need. Our team sends you suitable teachers or experts within 24 hours. No account needed.",
};

export default function RequestPage(props: PageProps<"/request">) {
  return (
    <div className="page-wrap flex flex-wrap items-start gap-x-12 gap-y-8 pt-6 pb-24">
      <section className="flex min-w-0 flex-[1_1_300px] flex-col gap-5" aria-labelledby="req-h">
        <div className="flex items-start gap-2">
          <h1 id="req-h" className="dpage">
            Tell us what you <span className="swash">need.</span>
          </h1>
          <Spark className="spark hide-md flex-none" />
        </div>
        <p className="lead">
          A person reads every request and sends you up to three teachers or experts who fit, each with their checks and dates, within 24
          hours.
        </p>
        <ol className="flex flex-col gap-3 text-[16px]">
          {["Send your request. It is free, and you need no account.", "Get your recommendations by email.", "Book with the one you like."].map((s, i) => (
            <li key={s} className="flex items-center gap-3">
              <span className="stepn">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <EscrowPanel />
      </section>
      <section className="card r2 app min-w-0 flex-[1_1_560px] p-5 sm:p-8" aria-label="Request form">
        <Suspense fallback={<div className="skeleton h-[760px]" />}>
          <Form searchParams={props.searchParams} />
        </Suspense>
      </section>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, user] = await Promise.all([searchParams, getSessionUser()]);
  const me = user && !user.dev ? user : null;
  const initial = {
    ...(typeof sp.category === "string" ? { category: sp.category } : {}),
    ...(typeof sp.q === "string" ? { q: sp.q.slice(0, 200) } : {}),
    ...(me?.name ? { name: me.name } : {}),
    ...(me?.email ? { email: me.email } : {}),
    ...(me?.phone ? { phone: me.phone } : {}),
  };
  return <RequestForm initial={initial} signedIn={!!me} />;
}
