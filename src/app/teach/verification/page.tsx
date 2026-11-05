import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { getMyChecks, latest } from "@/lib/data/verification";
import { LADDER } from "@/domain/payouts";
import { CHECKS } from "./config";
import { CheckPill } from "./check-section";

export const metadata: Metadata = { title: "Verification" };

const TRACKS: Record<string, string> = { school: "School", adults_professional: "Adults and professionals", practical: "Practical skills" };

/** T2: which checks are done and what is next (FR-VER-1). */
export default function VerificationPage() {
  return (
    <Guarded next="/teach/verification">
      <Ladder />
    </Guarded>
  );
}

async function Ladder() {
  const { checks, tracks, teacherId } = await getMyChecks();
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
    <div className="flex max-w-[760px] flex-col gap-6">
      <h1 className="t1">Verification</h1>
      <p className="text-ink-2">Each level adds a badge to your profile with the date it was checked. Learners see the badges, never your documents.</p>
      {tracks.length ? (
        <div className="flex flex-wrap gap-3">
          {tracks.map((t) => (
            <div key={t.track} className="stat">
              <span className="help">{TRACKS[t.track] ?? t.track}</span>
              <span className="v">Level {t.tier}</span>
              {t.waitlist_status === "waitlisted" ? <span className="help">Founding member, waiting for launch</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      <ol className="flex flex-col gap-4">
        {LADDER.map((rung) => (
          <li key={rung.tier} className="card flex flex-col gap-3 p-5">
            <div className="flex items-baseline gap-3">
              <span className="mono text-ink-2">{rung.tier}</span>
              <h2 className="t3">{rung.title}</h2>
            </div>
            <p className="help">{rung.text}</p>
            {rung.checks.length ? (
              <ul className="flex flex-col">
                {rung.checks.map((c) => {
                  const mine = latest(checks, c.type);
                  return (
                    <li key={c.type} className="border-b border-dashed border-line-2 last:border-0">
                      <Link href={c.href} className="flex items-center justify-between gap-3 py-2.5 text-ink no-underline hover:text-orange-ink">
                        <span>{CHECKS[c.type]?.title ?? c.type}</span>
                        <span className="flex items-center gap-2">
                          <CheckPill status={mine?.status ?? null} />
                          <ArrowRight size={16} aria-hidden="true" />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="help">Earned automatically from confirmed lessons and reviews.</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
