import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { MailCheck } from "lucide-react";
import { cleanEmail } from "@/domain/account";
import { PENDING_EMAIL_COOKIE } from "@/lib/account";
import { ResendForm } from "../../forms";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

export default function CheckEmailPage() {
  return (
    <div className="flex flex-col gap-6">
      <MailCheck size={40} aria-hidden="true" />
      <div className="flex flex-col gap-2">
        <h1 className="t1">Confirm your email</h1>
        <Suspense fallback={<div className="skeleton h-[120px]" />}>
          <Sent />
        </Suspense>
      </div>
      <p className="help">
        Check the spam folder too. If you already have an account with this address, no new email is sent:{" "}
        <Link href="/signin">sign in</Link> or <Link href="/forgot-password">reset your password</Link>.
      </p>
      <Link className="btn3 self-start" href="/signup">
        Use a different email address
      </Link>
    </div>
  );
}

async function Sent() {
  let email: string | null = null;
  try {
    email = cleanEmail((JSON.parse((await cookies()).get(PENDING_EMAIL_COOKIE)?.value ?? "{}") as { email?: unknown }).email);
  } catch {
    // ignore a damaged cookie
  }
  return (
    <>
      <p className="text-ink-2">
        We sent a link to {email ? <span className="mono break-all text-ink">{email}</span> : "your email address"}. Open it to finish creating
        your account; you will come back to where you were. The link works once, for 24 hours.
      </p>
      {email ? <ResendForm /> : null}
    </>
  );
}
