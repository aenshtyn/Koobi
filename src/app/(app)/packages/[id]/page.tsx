import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Guarded } from "@/components/app/shell";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { BookingPill } from "@/components/app/booking-pill";
import { getMyPackage } from "@/lib/data/account";
import { getOfferPage } from "@/lib/data/catalogue";
import { getSessionUser } from "@/lib/auth";
import { latestPackagePayment, settle } from "@/lib/payments";
import { paymentProvider } from "@/integrations/payments";
import { bookableSlots } from "@/domain/booking";
import { formatDate, formatKES, formatTime, formatWeekday } from "@/domain/format";
import { OFFER_MODES } from "@/domain/listing-input";
import { simulatePackagePayment } from "../actions";
import { BookLessonForm, PackagePayForm } from "../forms";

export const metadata: Metadata = { title: "Package" };

const STATUS: Record<string, string> = { pending_payment: "Waiting for payment", active: "Active", completed: "Completed", expired: "Ended", cancelled: "Cancelled" };

/** L9: the package, its payment, and booking lessons from it (FR-BOOK-6, -7). */
export default function PackagePage(props: PageProps<"/packages/[id]">) {
  return (
    <Guarded next="/sessions">
      <Package params={props.params} />
    </Guarded>
  );
}

async function Package({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getMyPackage(id);
  if (!found) notFound();
  const { pkg, lessons } = found;
  let payment = await latestPackagePayment(id);
  if (payment?.status === "pending") {
    await settle(payment.id);
    payment = await latestPackagePayment(id);
  }
  const [user, page] = await Promise.all([getSessionUser(), pkg.offering ? getOfferPage(pkg.offering.slug) : null]);
  const live = lessons.filter((l) => !["cancelled", "lapsed"].includes(l.status));
  const left = pkg.sessions_total - live.length;
  const slots = bookableSlots(page?.details?.next_slots ?? [], new Date()).filter((s) => !pkg.ends_on || s.slice(0, 10) <= pkg.ends_on);
  const modes = (pkg.offering?.modes ?? ["online"]).filter((m) => m !== "hybrid").map((m) => ({ value: m, label: OFFER_MODES.find(([c]) => c === m)?.[1] ?? m }));
  const sandbox = paymentProvider()?.name === "sandbox";
  const plan = pkg.plan_type === "managed" ? "Monthly plan" : "Package";
  return (
    <div className="flex max-w-[680px] flex-col gap-6">
      <Link className="btn3 self-start" href="/learning">
        My Learning
      </Link>
      <div className="flex flex-col gap-2">
        <span className="pill self-start">{STATUS[pkg.status] ?? pkg.status}</span>
        <h1 className="t1">
          {plan}: {pkg.offering?.title}
        </h1>
        <p className="text-ink-2">
          {pkg.teacher?.display_name} · for {pkg.learner?.alias} · <span className="mono">{pkg.sessions_total}</span> lessons,{" "}
          <span className="mono">{pkg.cadence_per_week}</span> a week
        </p>
      </div>
      <div className="card flex flex-col p-5">
        <div className="kv"><span>Price</span><span>{formatKES(pkg.price_kes)}</span></div>
        <div className="kv"><span>Lessons left to book</span><span>{Math.max(left, 0)}</span></div>
        <div className="kv"><span>Valid until</span><span>{pkg.ends_on ? formatDate(pkg.ends_on) : "—"}</span></div>
      </div>

      {pkg.status === "pending_payment" ? (
        payment?.status === "pending" ? (
          <div className="flex flex-col gap-3">
            <AutoRefresh seconds={4} />
            <p className="panel info">
              An M-Pesa prompt for <span className="mono font-semibold">{formatKES(payment.amount_kes)}</span> is on its way. Enter your PIN; this screen updates by
              itself.
            </p>
            {sandbox ? (
              <div className="flex flex-wrap gap-3">
                <form action={simulatePackagePayment}>
                  <input type="hidden" name="package_id" value={pkg.id} />
                  <input type="hidden" name="outcome" value="success" />
                  <button className="btn2" type="submit">Simulate: PIN entered</button>
                </form>
                <form action={simulatePackagePayment}>
                  <input type="hidden" name="package_id" value={pkg.id} />
                  <input type="hidden" name="outcome" value="failure" />
                  <button className="btn3" type="submit">Simulate: cancelled</button>
                </form>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {payment?.status === "failed" ? <p className="panel error">The last attempt did not go through: {payment.failure_reason}. Nothing was charged.</p> : null}
            <p className="panel escrow">Paid once for every lesson. Each lesson is paid to the teacher only after it happens.</p>
            <PackagePayForm packageId={pkg.id} phone={(user?.phone ?? "").replace(/^\+254/, "")} amount={formatKES(pkg.price_kes)} />
          </div>
        )
      ) : null}

      {pkg.status === "active" && left > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="book-h">
          <h2 id="book-h" className="t3">Book a lesson</h2>
          {slots.length ? (
            <BookLessonForm
              packageId={pkg.id}
              slots={slots.slice(0, 12).map((s) => ({ value: s, label: `${formatWeekday(s)} ${formatTime(s)}` }))}
              modes={modes}
            />
          ) : (
            <p className="help">No open times right now. Message the teacher to agree one, then check back.</p>
          )}
        </section>
      ) : null}

      {lessons.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="ls-h">
          <h2 id="ls-h" className="t3">Lessons</h2>
          <ul className="card flex flex-col divide-y divide-dashed divide-line-2 p-0!">
            {lessons.map((l) => (
              <li key={l.id}>
                <Link href={`/bookings/${l.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-ink no-underline hover:bg-orange-wash">
                  <span className="mono">{formatWeekday(l.starts_at)} {formatTime(l.starts_at)}</span>
                  <BookingPill status={l.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pkg.status !== "pending_payment" && pkg.offering ? (
        <div className="flex flex-wrap gap-4">
          <Link className="btn3" href={`/packages/new?offer=${pkg.offering.slug}&renew=${pkg.id}`}>
            Renew for the same learner
          </Link>
          {pkg.plan_type === "standard" && pkg.offering.modes.some((m) => m === "in_home" || m === "teacher_premises") ? (
            <Link className="btn3" href={`/packages/${pkg.id}/managed-plan`}>
              Monthly plan
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
