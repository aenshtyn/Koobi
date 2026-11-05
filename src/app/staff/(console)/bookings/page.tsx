import type { Metadata } from "next";
import Link from "next/link";
import { Guarded } from "@/components/app/shell";
import { BookingPill } from "@/components/app/booking-pill";
import { getStaffBookings } from "@/lib/data/staff-money";
import { BOOKING_LABELS, KIND_LABELS } from "@/domain/booking";
import { formatDate, formatKES, formatTime } from "@/domain/format";

export const metadata: Metadata = { title: "Bookings", robots: { index: false } };

const FILTERS = ["paid", "scheduled", "awaiting_confirmation", "disputed", "cancelled", "lapsed"];

export default function StaffBookingsPage(props: PageProps<"/staff/bookings">) {
  return (
    <Guarded next="/staff/bookings" anyOf={["concierge", "finance", "admin"]}>
      <Bookings searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Bookings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" && sp.status in BOOKING_LABELS ? sp.status : null;
  const rows = await getStaffBookings(status);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="t1">Bookings</h1>
      <nav className="flex flex-wrap gap-2" aria-label="Filter">
        <Link className={`chip sm${!status ? " on" : ""}`} href="/staff/bookings">All</Link>
        {FILTERS.map((f) => (
          <Link key={f} className={`chip sm${status === f ? " on" : ""}`} href={`/staff/bookings?status=${f}`}>
            {BOOKING_LABELS[f]}
          </Link>
        ))}
      </nav>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="table-k min-w-[860px]">
            <thead>
              <tr>
                <th scope="col">Lesson</th>
                <th scope="col">Teacher</th>
                <th scope="col">Payer</th>
                <th scope="col">When</th>
                <th scope="col">Paid</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>
                    <span className="font-semibold">{b.offering?.title ?? "—"}</span>
                    <p className="help">{KIND_LABELS[b.kind]}</p>
                  </td>
                  <td>{b.teacher?.display_name ?? "—"}</td>
                  <td>{b.payer?.display_name?.split(" ")[0] ?? "—"}</td>
                  <td className="mono text-[13px]">{formatDate(b.starts_at)} {formatTime(b.starts_at)}</td>
                  <td className="mono">{b.paid_at ? formatKES(b.price_kes - b.discount_kes) : "—"}</td>
                  <td><BookingPill status={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No bookings here.</p>
      )}
    </div>
  );
}
