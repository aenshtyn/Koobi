import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Loader2, XCircle } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { getMyBooking } from "@/lib/data/bookings";
import { latestPayment, settle } from "@/lib/payments";
import { paymentProvider } from "@/integrations/payments";
import { formatKES } from "@/domain/format";
import { simulatePayment } from "../../actions";

export const metadata: Metadata = { title: "Payment" };

export default function StatusPage(props: PageProps<"/checkout/[id]/status">) {
  return (
    <Guarded next="/sessions">
      <Status params={props.params} />
    </Guarded>
  );
}

async function Status({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await getMyBooking(id);
  if (!b) notFound();
  let p = await latestPayment(id);
  if (p?.status === "pending") {
    // A missed or slow webhook never strands the payer: re-check with the provider on every view.
    const outcome = await settle(p.id);
    if (outcome !== "pending") p = await latestPayment(id);
  }
  if (p?.status === "succeeded" || !["requested", "awaiting_payment"].includes(b.status)) redirect(`/bookings/${id}/confirmed`);
  if (!p) redirect(`/checkout/${id}/pay`);
  const sandbox = paymentProvider()?.name === "sandbox";
  const ageSeconds = (new Date().getTime() - new Date(p.created_at).getTime()) / 1000;

  if (p.status === "failed") {
    return (
      <div className="flex max-w-[560px] flex-col gap-5">
        <XCircle size={40} aria-hidden="true" className="text-error" />
        <h1 className="t1">The payment did not go through</h1>
        <p className="panel error">
          {p.failure_reason ?? "It was cancelled or timed out."} Nothing was charged.
        </p>
        <Link className="btn self-start" href={`/checkout/${id}/pay`}>
          Try again
        </Link>
      </div>
    );
  }

  return (
    <div className="flex max-w-[560px] flex-col gap-5">
      <AutoRefresh seconds={3} />
      <Loader2 size={40} aria-hidden="true" className="animate-spin text-orange" />
      <h1 className="t1">{p.method === "card" ? "Waiting for the card payment" : "Check your phone"}</h1>
      <div className="panel">
        <p>
          {p.method === "card"
            ? "Finish on the secure card page. This screen updates by itself."
            : <>An M-Pesa prompt for <span className="mono font-semibold">{formatKES(p.amount_kes)}</span> is on its way. Enter your PIN; this screen updates by itself.</>}
        </p>
      </div>
      <p className="help">
        Reference <span className="mono">{p.platform_ref}</span>
      </p>
      {ageSeconds > 75 ? (
        <div className="flex flex-col gap-2">
          <p className="font-semibold">No prompt yet?</p>
          <Link className="btn2 self-start" href={`/checkout/${id}/pay`}>
            Send the prompt again or change the number
          </Link>
        </div>
      ) : null}
      {sandbox ? (
        <div className="card flex flex-col gap-3 p-5">
          <p className="help">Sandbox: no real prompt is sent. Choose what the payer does.</p>
          <div className="flex flex-wrap gap-3">
            <form action={simulatePayment}>
              <input type="hidden" name="booking_id" value={id} />
              <input type="hidden" name="payment_id" value={p.id} />
              <input type="hidden" name="outcome" value="success" />
              <button className="btn2" type="submit">
                Simulate: PIN entered
              </button>
            </form>
            <form action={simulatePayment}>
              <input type="hidden" name="booking_id" value={id} />
              <input type="hidden" name="payment_id" value={p.id} />
              <input type="hidden" name="outcome" value="failure" />
              <button className="btn3" type="submit">
                Simulate: cancelled
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
