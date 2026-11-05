import type { Metadata } from "next";
import { Suspense } from "react";
import { brand } from "@/config/brand";
import { WelcomeForm } from "../forms";

export const metadata: Metadata = { title: "Welcome" };

export default function WelcomePage(props: PageProps<"/welcome">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="t1">
          <span lang="sw">Karibu</span> to {brand.name}
        </h1>
        <p className="text-ink-2">Two questions and you are in.</p>
      </div>
      <Suspense fallback={<div className="skeleton h-[360px]" />}>
        <Form searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/home";
  return <WelcomeForm next={next} />;
}
