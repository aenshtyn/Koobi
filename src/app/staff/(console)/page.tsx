import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { STAFF_ROLES } from "@/lib/auth";
import { PAGES } from "@/config/pages";

export const metadata: Metadata = { title: "Staff console", robots: { index: false } };

const QUEUES = [
  { href: "/staff/applications", name: "Expert applications", target: "Documents, a 15-minute meeting, then the decision" },
  { href: "/staff/profile-reviews", name: "Profile reviews", target: "Introduction videos, credentials and profile changes" },
  { href: "/staff/listings", name: "Learning experience approvals", target: "Decide within 2 working days" },
  { href: "/staff/verification", name: "Verification", target: "Decide within 1 to 2 working days" },
  { href: "/staff/requests", name: "Requests", target: "Shortlist within 24 hours, match within 48" },
  { href: "/staff/disputes", name: "Disputes", target: "First response the same day" },
  { href: "/staff/payouts", name: "Payout batches", target: "Weekly, two approvers" },
  { href: "/staff/reconciliation", name: "Reconciliation", target: "Daily; breaks block the next payout" },
];

export default function StaffHome() {
  return (
    <Guarded next="/staff" anyOf={STAFF_ROLES}>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="t1">Queues</h1>
          <p className="text-ink-2">Every queue with its service target. Counts and timers appear as each queue is connected.</p>
        </div>
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {QUEUES.map((q) => {
            const spec = PAGES.find((p) => p.route === q.href);
            return (
              <li key={q.href}>
                <Link className="stat h-full text-ink no-underline hover:bg-orange-wash" href={q.href}>
                  <span className="t3">{q.name}</span>
                  <span className="help">{q.target}</span>
                  <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-ink">
                    {spec?.built ? "Open" : `Sprint ${spec?.sprint ?? "v1"}`}
                    <ArrowRight size={16} aria-hidden="true" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </Guarded>
  );
}
