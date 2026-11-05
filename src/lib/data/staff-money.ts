import "server-only";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";

export type StaffBooking = {
  id: string;
  kind: string;
  status: string;
  starts_at: string;
  price_kes: number;
  discount_kes: number;
  paid_at: string | null;
  created_at: string;
  offering: { title: string } | null;
  teacher: { display_name: string } | null;
  payer: { display_name: string | null } | null;
};

export async function getStaffBookings(status: string | null): Promise<StaffBooking[]> {
  if (!hasSupabase) return [];
  const db = await serverClient();
  let q = db
    .from("bookings")
    .select("id, kind, status, starts_at, price_kes, discount_kes, paid_at, created_at, offering:offerings(title), teacher:teachers(display_name), payer:profiles!bookings_booked_by_user_id_fkey(display_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(`bookings: ${error.message}`);
  return (data ?? []) as unknown as StaffBooking[];
}

export type Journal = {
  id: string;
  kind: string;
  memo: string | null;
  posted_at: string;
  posted_by: string;
  entries: { account: string; side: "debit" | "credit"; amount_kes: number }[];
};

export async function getLedger(): Promise<{ balances: { account: string; balance: number }[]; journals: Journal[] }> {
  if (!hasSupabase) return { balances: [], journals: [] };
  const db = await serverClient();
  const [entries, journals] = await Promise.all([
    db.from("ledger_entries").select("account, side, amount_kes").limit(10000),
    db.from("ledger_transactions").select("id, kind, memo, posted_at, posted_by, entries:ledger_entries(account, side, amount_kes)").order("posted_at", { ascending: false }).limit(30),
  ]);
  if (entries.error) throw new Error(`ledger_entries: ${entries.error.message}`);
  const map = new Map<string, number>();
  for (const e of (entries.data ?? []) as { account: string; side: string; amount_kes: number }[]) {
    map.set(e.account, (map.get(e.account) ?? 0) + (e.side === "debit" ? e.amount_kes : -e.amount_kes));
  }
  return {
    balances: [...map.entries()].map(([account, balance]) => ({ account, balance })).sort((a, b) => a.account.localeCompare(b.account)),
    journals: (journals.data ?? []) as Journal[],
  };
}
