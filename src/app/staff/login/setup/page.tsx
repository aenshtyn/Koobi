import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/ui/trust";
import { STAFF_ROLES, getSessionUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { EnrolForm } from "../form";

export const metadata: Metadata = { title: "Set up your authenticator", robots: { index: false } };

/** First staff sign-in, or the link in an invitation: choose a password if needed, set up the app. */
export default function StaffSetupPage() {
  return (
    <div className="app flex min-h-dvh flex-col items-center px-4 pt-12 pb-16">
      <div className="flex w-full max-w-[460px] flex-col gap-6">
        <Logo />
        <div className="flex flex-col gap-2">
          <h1 className="t1">Set up your authenticator</h1>
          <p className="text-ink-2">Staff sign in with a password and a six-digit code from an app on their phone. You set it up once.</p>
        </div>
        <Suspense fallback={<div className="skeleton h-[280px]" />}>
          <Setup />
        </Suspense>
      </div>
    </div>
  );
}

async function Setup() {
  if (!hasSupabase) return <p className="panel info">Staff sign-in is not connected in this environment.</p>;
  const user = await getSessionUser();
  if (!user) redirect("/staff/login");
  if (!user.roles.some((r) => STAFF_ROLES.includes(r))) redirect("/forbidden");
  const db = await serverClient();
  const [{ data: factors }, { data: auth }] = await Promise.all([db.auth.mfa.listFactors(), db.auth.getUser()]);
  if (factors?.totp?.some((f) => f.status === "verified")) {
    return (
      <div className="panel info" role="note">
        <p>
          <b>Your authenticator is already set up.</b> <Link href="/staff/login">Sign in with your code</Link>. Lost the phone? Ask an admin
          to remove the old authenticator in the Supabase dashboard, then sign in again.
        </p>
      </div>
    );
  }
  return <EnrolForm needsPassword={!!auth.user?.user_metadata?.needs_password} />;
}
