import type { Metadata } from "next";
import Link from "next/link";
import { Guarded } from "@/components/app/shell";
import { getMyChecks } from "@/lib/data/verification";

export const metadata: Metadata = { title: "Waitlist" };

const TRACKS: Record<string, string> = { school: "School", adults_professional: "Adults and professionals", practical: "Practical skills" };
const STATUS: Record<string, string> = {
  none: "Open: learners can find you once your offer is approved.",
  waitlisted: "Founding member: you are listed when this area opens to learners.",
  released: "Open: released from the founding-member list.",
};

/** T9: founding members before a category opens (FR-OFF-5). */
export default function WaitlistPage() {
  return (
    <Guarded next="/teach/waitlist">
      <Waitlist />
    </Guarded>
  );
}

async function Waitlist() {
  const { tracks } = await getMyChecks();
  return (
    <div className="flex max-w-[620px] flex-col gap-6">
      <h1 className="t1">Where you can be found</h1>
      {tracks.length ? (
        <ul className="flex flex-col gap-3">
          {tracks.map((t) => (
            <li key={t.track} className="card flex flex-col gap-1 p-5">
              <span className="font-semibold">{TRACKS[t.track] ?? t.track}</span>
              <span className="help">{STATUS[t.waitlist_status] ?? t.waitlist_status}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <p className="font-semibold">No areas yet.</p>
          <p className="help">Areas come from the categories you teach in.</p>
          <Link className="btn2" href="/teach/apply">
            Your profile
          </Link>
        </div>
      )}
    </div>
  );
}
