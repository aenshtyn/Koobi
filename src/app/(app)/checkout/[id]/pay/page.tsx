import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Guarded } from "@/components/app/shell";
import { BookingSummary } from "@/components/app/booking-summary";
import { EscrowPanel } from "@/components/ui/trust";
import { getMyBooking } from "@/lib/data/bookings";
import { getCredits } from "@/lib/data/lessons";
import { getSessionUser } from "@/lib/auth";
import { formatKES } from "@/domain/format";
import { paymentProvider } from "@/integrations/payments";
import { payWithCard, payWithCredit } from "../../actions";
import { MpesaForm } from "../../pay-form";

export const metadata: Metadata = { title: "Pay" };

export default function PayPage(props: PageProps<"/checkout/[id]/pay">) {
  return (
    <Guarded next="/sessions">
      <Pay params={props.params} searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Pay({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp, user, credits] = await Promise.all([params, searchParams, getSessionUser(), getCredits()]);
  const b = await getMyBooking(id);
  if (!b) notFound();
  if (!["requested", "awaiting_payment"].includes(b.status)) redirect(`/checkout/${id}/status`);
  const total = b.price_kes - b.discount_kes;
  const provider = paymentProvider();
  const local = (user?.phone ?? "").replace(/^\+254/, "");
  const spendable = credits.balance - credits.lines.reduce((sum, l) => sum + l.open_refund_kes, 0);
  return (
    <div className="flex max-w-[560px] flex-col gap-6">
      <div className="steps" role="group" aria-label="Step 2 of 3: pay">
        <span className="done"><span className="n">1</span> Time</span>
        <span className="bar done" aria-hidden="true" />
        <span className="cur"><span className="n">2</span> Pay</span>
        <span className="bar" aria-hidden="true" />
        <span><span className="n">3</span> Done</span>
      </div>
      <h1 className="t1">Pay to book</h1>
      {typeof sp.error === "string" ? <p className="panel error">{sp.error}</p> : null}
      <BookingSummary b={b} />
      <EscrowPanel who={b.teacher_name} />
      {spendable >= total ? (
        <form action={payWithCredit} className="card flex flex-col gap-3 p-5">
          <input type="hidden" name="booking_id" value={b.id} />
          <p>
            You have <span className="mono">{formatKES(spendable)}</span> in credit. This lesson uses <span className="mono">{formatKES(total)}</span> of it.
          </p>
          <button className="btn2 self-start" type="submit">
            Pay with my credit
          </button>
        </form>
      ) : null}
      {provider ? (
        <>
          <MpesaForm bookingId={b.id} phone={local} amount={formatKES(total)} />
          <form action={payWithCard} className="flex flex-col items-center gap-1">
            <input type="hidden" name="booking_id" value={b.id} />
            <button className="btn3" type="submit">
              Pay by card instead
            </button>
            <p className="text-center text-xs text-ink-2">Processed by Paystack · Lipa na M-Pesa{provider.name === "sandbox" ? " · sandbox, no real money" : ""}</p>
          </form>
        </>
      ) : (
        <p className="panel info">Payments are not switched on in this environment yet.</p>
      )}
      <Link className="btn3 self-start" href={`/offers/${b.slug}`}>
        Change the time
      </Link>
    </div>
  );
}
