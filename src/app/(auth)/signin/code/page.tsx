import type { Metadata } from "next";
import Link from "next/link";
import { CodeForm } from "../../forms";

export const metadata: Metadata = { title: "Enter your code" };

export default function CodePage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="t1">Check your SMS</h1>
        <p className="text-ink-2">
          We sent a six-digit code to your phone. It works for <span className="mono">10</span> minutes.
        </p>
      </div>
      <CodeForm />
      <Link className="btn3 self-start" href="/signin">
        Use a different number
      </Link>
    </div>
  );
}
