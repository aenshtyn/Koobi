import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { safeNext } from "@/domain/account";
import { ForgotForm } from "../forms";
import { NotConnected } from "../not-connected";

export const metadata: Metadata = { title: "Forgot your password" };

export default function ForgotPasswordPage(props: PageProps<"/forgot-password">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="t1">Forgot your password?</h1>
        <p className="text-ink-2">Enter the email address on your account. We email you a link to choose a new password.</p>
      </div>
      <NotConnected />
      <Suspense fallback={<div className="skeleton h-[180px]" />}>
        <Form searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const next = safeNext((await searchParams).next);
  const staff = next.startsWith("/staff");
  return (
    <>
      <ForgotForm next={next} />
      <Link className="btn3 self-start" href={staff ? "/staff/login" : `/signin${next === "/home" ? "" : `?next=${encodeURIComponent(next)}`}`}>
        Back to sign in
      </Link>
    </>
  );
}
