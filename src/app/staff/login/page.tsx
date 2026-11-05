import type { Metadata } from "next";
import { Logo } from "@/components/ui/trust";
import Link from "next/link";
import { testLogins } from "@/lib/supabase/config";
import { StaffLoginForm } from "./form";

export const metadata: Metadata = { title: "Staff sign-in", robots: { index: false } };

export default function StaffLoginPage() {
  return (
    <div className="app flex min-h-dvh flex-col items-center px-4 pt-12 pb-16">
      <div className="flex w-full max-w-[420px] flex-col gap-6">
        <Logo />
        <div className="flex flex-col gap-2">
          <h1 className="t1">Staff sign-in</h1>
          <p className="text-ink-2">Every sign-in and every document view is recorded in the audit log.</p>
        </div>
        <StaffLoginForm />
        {testLogins ? (
          <Link className="btn3 self-start" href="/signin/test">
            Use a test staff account instead
          </Link>
        ) : null}
      </div>
    </div>
  );
}
