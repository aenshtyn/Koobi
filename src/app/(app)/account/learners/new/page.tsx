import type { Metadata } from "next";
import Link from "next/link";
import { Guarded } from "@/components/app/shell";
import { getGuardian } from "@/lib/data/account";
import { getPolicyText } from "@/lib/data/bookings";
import { CURRICULA } from "@/domain/listing-input";
import { ChildForm } from "../../forms";

export const metadata: Metadata = { title: "Add a child" };

/** L20: parental consent before any child data (FR-ACC-5). */
export default function NewChildPage() {
  return (
    <Guarded next="/account/learners/new">
      <NewChild />
    </Guarded>
  );
}

async function NewChild() {
  const [{ guardian }, consent] = await Promise.all([getGuardian(), getPolicyText("parental-consent-2026-11-v1")]);
  return (
    <div className="flex max-w-[620px] flex-col gap-6">
      <Link className="btn3 self-start" href="/account/learners">
        Children
      </Link>
      <h1 className="t1">Add a child</h1>
      <ChildForm consentText={consent ?? "Consent text unavailable. Try again shortly."} curricula={CURRICULA.map(([c, l]) => [c, l] as [string, string])} needName={!guardian?.display_name} />
    </div>
  );
}
