import type { Metadata } from "next";
import Link from "next/link";
import { Guarded } from "@/components/app/shell";
import { getMyTeacher } from "@/lib/data/listings";
import { getSessionUser } from "@/lib/auth";
import { OfferForm } from "../../forms";

export const metadata: Metadata = { title: "New offer" };

export default function NewOfferPage() {
  return (
    <Guarded next="/teach/offers/new">
      <NewOffer />
    </Guarded>
  );
}

async function NewOffer() {
  const [teacher, user] = await Promise.all([getMyTeacher(), getSessionUser()]);
  if (!teacher && !user?.dev) {
    return (
      <div className="empty max-w-[560px]">
        <p className="t3">Apply first, then create offers.</p>
        <Link className="btn" href="/teach/apply">
          Apply to teach
        </Link>
      </div>
    );
  }
  return (
    <div className="flex max-w-[760px] flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="t1">New one-to-one offer</h1>
        <p className="text-ink-2">Save a draft any time. When you send it for review, a person checks it, usually within two working days.</p>
      </div>
      <OfferForm initial={{ language_codes: teacher?.languages.length ? teacher.languages : ["en"] }} live={false} />
    </div>
  );
}
