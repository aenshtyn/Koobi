import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { brand } from "@/config/brand";
import { safeNext } from "@/domain/account";
import { getSessionUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { WelcomeForm } from "../forms";

export const metadata: Metadata = { title: "Welcome" };

/** Only for accounts that have no name or no role yet (invited people, older phone accounts). */
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
  const next = safeNext(sp.next);
  const user = hasSupabase ? await getSessionUser() : null;
  if (hasSupabase && !user) redirect(`/signin?next=${encodeURIComponent(next)}`);
  if (user?.name && user.roles.length) redirect(next);
  return <WelcomeForm next={next} name={user?.name ?? ""} />;
}
