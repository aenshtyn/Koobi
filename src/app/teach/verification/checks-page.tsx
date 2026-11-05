import Link from "next/link";
import { getMyChecks, latest } from "@/lib/data/verification";
import { CHECKS } from "./config";
import { CheckSection } from "./check-section";

const DONE: Record<string, string> = { uploaded: "Uploaded. Add the rest, then send it for review.", sent: "Sent. A reviewer will look at it; the result shows here." };

/** Renders one or more checks on a verification page. */
export async function ChecksPage({ title, types, path, done }: { title: string; types: string[]; path: string; done?: string }) {
  const { checks, docs, teacherId } = await getMyChecks();
  if (!teacherId) {
    return (
      <div className="empty">
        <p className="font-semibold">Tell us about yourself first.</p>
        <Link className="btn" href="/teach/apply">
          Start your application
        </Link>
      </div>
    );
  }
  return (
    <div className="flex max-w-[680px] flex-col gap-6">
      <Link className="btn3 self-start" href="/teach/verification">
        All checks
      </Link>
      <h1 className="t1">{title}</h1>
      {done && DONE[done] ? (
        <p className="panel escrow" role="status">
          {DONE[done]}
        </p>
      ) : null}
      {types.map((t) => (
        <CheckSection key={t} config={CHECKS[t]} check={latest(checks, t)} docs={docs} path={path} />
      ))}
    </div>
  );
}
