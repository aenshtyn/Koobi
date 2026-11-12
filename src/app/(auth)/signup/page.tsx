import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { brand } from "@/config/brand";
import { cleanEmail, isIntent, safeNext } from "@/domain/account";
import { getSessionUser } from "@/lib/auth";
import { PREFILL_COOKIE } from "@/lib/account";
import { hasSupabase } from "@/lib/supabase/config";
import { SignUpForm } from "../forms";
import { NotConnected } from "../not-connected";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage(props: PageProps<"/signup">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="t1">Create your {brand.name} account</h1>
        <p className="text-ink-2">Your email and a password. You come straight back to where you were.</p>
      </div>
      <NotConnected />
      <Suspense fallback={<div className="skeleton h-[560px]" />}>
        <Form searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, "");
  if (hasSupabase && (await getSessionUser())) redirect(next || "/home");
  // Name and email typed on the request form a moment ago, so they are not asked twice.
  let prefill: { name?: string; email?: string } = {};
  try {
    const v = JSON.parse((await cookies()).get(PREFILL_COOKIE)?.value ?? "{}") as { name?: unknown; email?: unknown };
    prefill = { name: typeof v.name === "string" ? v.name.slice(0, 80) : undefined, email: cleanEmail(v.email) ?? undefined };
  } catch {
    // ignore a damaged cookie
  }
  const intent = isIntent(sp.intent) ? sp.intent : /^\/teach(\/|$)/.test(next) ? "teach" : undefined;
  return (
    <>
      <SignUpForm next={next} initial={{ ...prefill, ...(intent ? { intent } : {}) }} />
      <p className="text-[16px]">
        Already have an account? <Link href={`/signin${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Sign in</Link>
      </p>
    </>
  );
}
