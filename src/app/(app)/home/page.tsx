import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, Compass } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { RequestForm } from "@/components/request/request-form";
import { readDraft } from "@/components/request/draft";
import { getSessionUser } from "@/lib/auth";
import { CATEGORIES } from "@/domain/taxonomy";

export const metadata: Metadata = { title: "Home" };

export default function LearnerHome(props: PageProps<"/home">) {
  return (
    <Guarded next="/home">
      <div className="flex flex-col gap-10">
        <Suspense fallback={<div className="skeleton h-12 w-80" />}>
          <Greeting searchParams={props.searchParams} />
        </Suspense>

        <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="card r2 p-6 sm:p-8" aria-labelledby="ask-h">
            <h2 id="ask-h" className="t2 mb-1">
              Ask for a match
            </h2>
            <p className="mb-6 text-ink-2">A person reads your request and sends three checked teachers or experts within 24 hours.</p>
            <Suspense fallback={<div className="skeleton h-[560px]" />}>
              <Form />
            </Suspense>
          </section>

          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-3" aria-labelledby="up-h">
              <h2 id="up-h" className="t3">
                Your lessons
              </h2>
              <div className="empty">
                <CalendarDays size={24} aria-hidden="true" />
                <p className="font-semibold">No lessons yet.</p>
                <p className="help">Your first trial is covered by the replacement promise: if it is not the right fit, we match you again.</p>
              </div>
            </section>
            <section className="flex flex-col gap-3" aria-labelledby="br-h">
              <h2 id="br-h" className="t3">
                Or browse
              </h2>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <Link key={c.code} className="chip" href={`/explore/${c.slug}`}>
                    {c.short}
                  </Link>
                ))}
              </div>
              <Link className="btn2 ink self-start" href="/explore">
                <Compass size={18} aria-hidden="true" />
                Explore every offer
              </Link>
            </section>
          </div>
        </div>
      </div>
    </Guarded>
  );
}

async function Greeting({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [user, sp] = await Promise.all([getSessionUser(), searchParams]);
  const first = user?.name?.split(" ")[0];
  return (
    <div className="flex flex-col gap-4">
      <h1 className="t1">
        <span lang="sw">Habari</span>
        {first ? `, ${first}` : ""}.
      </h1>
      {sp.request === "sent" ? (
        <div className="panel escrow items-center" role="status">
          <span className="seal" aria-hidden="true" />
          <p>
            <b>Request sent.</b> A person is on it and will reply within 24 hours, here or on WhatsApp.
          </p>
        </div>
      ) : null}
    </div>
  );
}

async function Form() {
  const draft = await readDraft();
  return <RequestForm initial={draft} back="/home" />;
}
