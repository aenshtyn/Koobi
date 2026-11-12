import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import TEST_ACCOUNTS from "@/config/test-accounts.json";
import { testLogins } from "@/lib/supabase/config";
import { TestSignInForm } from "../../forms";

export const metadata: Metadata = { title: "Test accounts", robots: { index: false } };

/** Dev and staging only (KOOBI_TEST_LOGINS=true). One account per role; see scripts/test-users.mjs. */
export default function TestSignInPage() {
  if (!testLogins) notFound();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="t1">Test accounts</h1>
        <p className="text-ink-2">
          One account for each kind of user, so you can see every side of the product. Sign out from the top bar to switch.
        </p>
      </div>
      <div className="panel info" role="note">
        <p>
          <b>Not for real people.</b> This page exists only where test accounts are switched on. Real users sign in with
          their email and password on the <Link href="/signin">normal sign-in page</Link>.
        </p>
      </div>
      <TestSignInForm accounts={TEST_ACCOUNTS.map(({ key, email, label, note }) => ({ key, email, label, note }))} />
    </div>
  );
}
