import { getTeachingBookings } from "@/lib/data/bookings";
import { getSessionUser } from "@/lib/auth";
import { BOOKING_LABELS, KIND_LABELS } from "@/domain/booking";

/** The expert's own bookings as a CSV file (what the Bookings page shows, nothing more). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  const rows = await getTeachingBookings();
  const cell = (v: unknown) => {
    const s = String(v ?? "");
    // Leading =, +, - or @ would run as a formula in a spreadsheet.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const when = (iso: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }).format(new Date(iso));
  const lines = [
    ["Learner", "Booked by", "Learning experience", "Type", "Starts (Nairobi)", "Minutes", "Where", "Price (KES)", "Status"],
    ...rows.map((b) => [b.learner_alias, b.payer_first_name ?? "", b.title, KIND_LABELS[b.kind] ?? b.kind, when(b.starts_at), b.duration_minutes, b.mode, b.price_kes, BOOKING_LABELS[b.status] ?? b.status]),
  ];
  return new Response(lines.map((l) => l.map(cell).join(",")).join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="koobi-bookings.csv"', "Cache-Control": "no-store" },
  });
}
