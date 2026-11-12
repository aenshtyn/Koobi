import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { safeNext } from "@/domain/account";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { NewPasswordForm } from "../forms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default function ResetPasswordPage(props: PageProps<"/reset-password">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="t1">Choose a new password</h1>
        <p className="text-ink-2">When you save it, every other device signed in to your account is signed out.</p>
      </div>
      <Suspense fallback={<div className="skeleton h-[300px]" />}>
        <Form searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  if (!hasSupabase) return <p className="panel info">Sign-in is not connected in this environment.</p>;
  const db = await serverClient();
  const { data } = await db.auth.getUser();
  if (!data.user) {
    return (
      <div className="panel info" role="note">
        <p>
          <b>Open the link from your email first.</b> It works once, for one hour. <Link href="/forgot-password">Send me a new link</Link>
        </p>
      </div>
    );
  }
  const { data: factors } = await db.auth.mfa.listFactors();
  const needsCode = !!factors?.totp?.some((f) => f.status === "verified");
  return <NewPasswordForm next={safeNext(sp.next, needsCode ? "/staff" : "/home")} needsCode={needsCode} />;
}
