import type { Metadata } from "next";
import { Suspense } from "react";
import { PhoneForm } from "../forms";
import { NotConnected } from "../not-connected";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage(props: PageProps<"/signin">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="t1">Sign in or sign up</h1>
        <p className="text-ink-2">One phone number, no password. Browsing needs no account; you only sign in to book or teach.</p>
      </div>
      <NotConnected />
      <Suspense fallback={<div className="skeleton h-[220px]" />}>
        <Form searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/home";
  return <PhoneForm next={next} />;
}
