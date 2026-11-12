import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { safeNext } from "@/domain/account";
import { getSessionUser } from "@/lib/auth";
import { SIGNED_OUT_COOKIE } from "@/lib/account";
import { hasSupabase, testLogins } from "@/lib/supabase/config";
import { SignInForm } from "../forms";
import { NotConnected } from "../not-connected";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage(props: PageProps<"/signin">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="t1">Sign in</h1>
        <p className="text-ink-2">Use the email and password you chose when you created your account.</p>
      </div>
      <NotConnected />
      <Suspense fallback={<div className="skeleton h-[300px]" />}>
        <Form searchParams={props.searchParams} />
      </Suspense>
      {testLogins ? (
        <Link className="btn2 ink" href="/signin/test">
          Use a test account
        </Link>
      ) : null}
    </div>
  );
}

function ended(hours: number) {
  return hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hours`;
}

async function Form({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (hasSupabase && (await getSessionUser())) redirect(next);
  const hours = Number((await cookies()).get(SIGNED_OUT_COOKIE)?.value);
  const carry = next === "/home" ? "" : `?next=${encodeURIComponent(next)}`;
  return (
    <>
      {hours > 0 ? (
        <div className="panel info" role="status">
          <p>
            <b>You were signed out.</b> To keep your account safe we ask for your password again after {ended(hours)}. Nothing was lost.
          </p>
        </div>
      ) : null}
      {sp.reset ? (
        <div className="panel escrow" role="status">
          <p>
            <b>Password changed.</b> Sign in with the new one.
          </p>
        </div>
      ) : null}
      <SignInForm next={next} />
      <div className="flex flex-wrap items-center justify-between gap-3 text-[16px]">
        <Link href={`/forgot-password${carry}`}>Forgot your password?</Link>
      </div>
      <div className="card flat flex flex-wrap items-center justify-between gap-3">
        <p>
          <b>New to Koobi?</b> It takes a minute.
        </p>
        <Link className="btn2" href={`/signup${carry}`}>
          Create an account
        </Link>
      </div>
    </>
  );
}
