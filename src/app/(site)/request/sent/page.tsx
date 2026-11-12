import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { MailCheck } from "lucide-react";
import { cleanEmail } from "@/domain/account";

export const metadata: Metadata = { title: "Request sent", robots: { index: false } };

export default function RequestSentPage() {
  return (
    <div className="page-wrap flex flex-1 flex-col items-start gap-5 pt-10 pb-24">
      <MailCheck size={44} aria-hidden="true" />
      <h1 className="dpage max-w-[720px]">
        We have your <span className="swash">request.</span>
      </h1>
      <Suspense fallback={<div className="skeleton h-[160px] w-full max-w-[640px]" />}>
        <Sent />
      </Suspense>
    </div>
  );
}

async function Sent() {
  let email: string | null = null;
  let id: string | null = null;
  try {
    const v = JSON.parse((await cookies()).get("koobi_request_sent")?.value ?? "{}") as { email?: unknown; id?: unknown };
    email = cleanEmail(v.email);
    id = typeof v.id === "string" && /^[0-9a-f-]{36}$/.test(v.id) ? v.id : null;
  } catch {
    // ignore a damaged cookie
  }
  return (
    <>
      <p className="lead max-w-[640px]">
        A person on our team reads it and emails {email ? <span className="mono break-all text-ink">{email}</span> : "you"} up to three
        teachers or experts who fit, within 24 hours. You only pay when you book.
      </p>
      <div className="card r2 flex max-w-[640px] flex-col items-start gap-3 p-6">
        <h2 className="mk sm">Want to follow it?</h2>
        <p className="text-ink-2">
          Create your account with the same email address. Your request will be waiting there, and you can choose from your
          recommendations and message the expert.
        </p>
        <Link className="btn" href={`/signup?next=${encodeURIComponent(id ? `/requests/${id}` : "/home")}`}>
          Create my account
        </Link>
      </div>
      <Link className="more" href="/explore">
        Explore learning while you wait
      </Link>
    </>
  );
}
