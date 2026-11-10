import "server-only";
import { hasSupabase } from "@/lib/supabase/config";
import { serverClient } from "@/lib/supabase/server";
import { decryptField, mask } from "@/lib/crypto";

/** Teacher money screens (T22, T23, T28). Row-level security returns only the caller's rows. */

export async function getMyTeacherPayout(): Promise<{ masked: string | null; kraMasked: string | null; ownership: string | null }> {
  if (!hasSupabase) return { masked: null, kraMasked: null, ownership: null };
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { masked: null, kraMasked: null, ownership: null };
  const { data } = await db.from("teachers").select("payout_phone_enc, kra_pin_enc, payout_ownership_status").eq("user_id", auth.user.id).maybeSingle();
  if (!data) return { masked: null, kraMasked: null, ownership: null };
  const safe = (v: string | null) => {
    try {
      return mask(decryptField(v));
    } catch {
      return v ? "saved" : null;
    }
  };
  return { masked: safe(data.payout_phone_enc), kraMasked: safe(data.kra_pin_enc), ownership: data.payout_ownership_status as string };
}

export type Earnings = { held_kes: number; owed_kes: number; in_payout_kes: number; paid_kes: number; threshold_kes: number; next_payout_on: string };

export type UnpaidLine = { id: string; amount_kes: number; posted_at: string; booking_id: string | null; commission_rate: number | null };

export type PayoutRow = {
  id: string;
  status: string;
  gross_kes: number;
  platform_fee_kes: number;
  withholding_kes: number;
  net_kes: number;
  transfer_fee_kes: number;
  exclusion_reason: string | null;
  sent_at: string | null;
  created_at: string;
  batch: { week_start: string } | null;
};

const PAYOUT_COLS = "id, status, gross_kes, platform_fee_kes, withholding_kes, net_kes, transfer_fee_kes, exclusion_reason, sent_at, created_at, batch:payout_batches(week_start)";

export async function getEarnings(): Promise<{ summary: Earnings | null; unpaid: UnpaidLine[]; payouts: PayoutRow[] }> {
  if (!hasSupabase) return { summary: null, unpaid: [], payouts: [] };
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { summary: null, unpaid: [], payouts: [] };
  const [summary, entries, payouts] = await Promise.all([
    db.rpc("my_earnings").maybeSingle(),
    db
      .from("ledger_entries")
      .select("id, amount_kes, posted_at, booking_id, commission_rate, side, account")
      .eq("counterparty_user_id", auth.user.id)
      .eq("account", "teacher_payable")
      .eq("side", "credit")
      .order("posted_at", { ascending: false })
      .limit(200),
    db.from("payouts").select(PAYOUT_COLS).order("created_at", { ascending: false }).limit(52),
  ]);
  // Lines already on a payout that went out or is on its way are not "unpaid".
  const ids = ((entries.data ?? []) as UnpaidLine[]).map((e) => e.id);
  const { data: onStatements } = ids.length ? await db.from("payout_lines").select("ledger_entry_id").in("ledger_entry_id", ids) : { data: [] };
  const taken = new Set(((onStatements ?? []) as { ledger_entry_id: string }[]).map((l) => l.ledger_entry_id));
  return {
    summary: (summary.data as Earnings | null) ?? null,
    unpaid: ((entries.data ?? []) as UnpaidLine[]).filter((e) => !taken.has(e.id)),
    payouts: (payouts.data ?? []) as unknown as PayoutRow[],
  };
}

export type StatementLine = {
  id: string;
  gross_kes: number;
  commission_rate: number;
  commission_kes: number;
  withholding_kes: number;
  net_kes: number;
  booking: { id: string; kind: string; starts_at: string; offering: { title: string } | null } | null;
};

export async function getStatement(id: string): Promise<{ payout: PayoutRow; lines: StatementLine[]; teacher: { display_name: string } | null } | null> {
  if (!hasSupabase || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const db = await serverClient();
  const { data: payout } = await db.from("payouts").select(`${PAYOUT_COLS}, teacher:teachers(display_name)`).eq("id", id).maybeSingle();
  if (!payout) return null;
  const { data: lines } = await db
    .from("payout_lines")
    .select("id, gross_kes, commission_rate, commission_kes, withholding_kes, net_kes, booking:bookings(id, kind, starts_at, offering:offerings(title))")
    .eq("payout_id", id);
  const { teacher, ...p } = payout as unknown as PayoutRow & { teacher: { display_name: string } | null };
  return {
    payout: p,
    lines: ((lines ?? []) as unknown as StatementLine[]).sort((a, b) => (a.booking?.starts_at ?? "").localeCompare(b.booking?.starts_at ?? "")),
    teacher,
  };
}

// ---------------------------------------------------------------------------
// Expert workspace overview (dashboard and Business page). All figures come from the ledger and
// the expert's own bookings; nothing is estimated.

export type MonthEarning = { month: string; net_kes: number };

/** What the expert earned (after Koobi's fee and withholding tax) per calendar month, Nairobi time, newest last. */
export async function getEarningsByMonth(months = 6): Promise<MonthEarning[]> {
  const now = new Date();
  const key = (d: Date) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Africa/Nairobi" }).format(d).slice(0, 7);
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) keys.push(key(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15))));
  const empty = keys.map((month) => ({ month, net_kes: 0 }));
  if (!hasSupabase) return empty;
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return empty;
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1)).toISOString();
  const { data } = await db
    .from("ledger_entries")
    .select("amount_kes, posted_at")
    .eq("counterparty_user_id", auth.user.id)
    .eq("account", "teacher_payable")
    .eq("side", "credit")
    .gte("posted_at", since)
    .limit(5000);
  const sums = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const e of (data ?? []) as { amount_kes: number; posted_at: string }[]) {
    const k = key(new Date(e.posted_at));
    if (sums.has(k)) sums.set(k, (sums.get(k) ?? 0) + e.amount_kes);
  }
  return keys.map((month) => ({ month, net_kes: sums.get(month) ?? 0 }));
}

export function monthLabel(month: string, long = false): string {
  return new Intl.DateTimeFormat("en-GB", { month: long ? "long" : "short", timeZone: "UTC" }).format(new Date(`${month}-15T00:00:00Z`));
}

/** What was actually posted to the expert for one booking once it was released; null before that. */
export async function getBookingMoney(bookingId: string): Promise<{ net_kes: number; withholding_kes: number } | null> {
  if (!hasSupabase || !/^[0-9a-f-]{36}$/.test(bookingId)) return null;
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data } = await db.from("ledger_entries").select("account, side, amount_kes").eq("booking_id", bookingId).eq("counterparty_user_id", auth.user.id).in("account", ["teacher_payable", "withholding_payable"]);
  const rows = (data ?? []) as { account: string; side: string; amount_kes: number }[];
  const sum = (account: string) => rows.filter((r) => r.account === account && r.side === "credit").reduce((s, r) => s + r.amount_kes, 0);
  const net = sum("teacher_payable");
  return net ? { net_kes: net, withholding_kes: sum("withholding_payable") } : null;
}


// ---------------------------------------------------------------------------
// Earnings & Payouts page (T22): every credit to the expert, the tax withheld per booking, and which
// payout each credit went out on.

export type MoneyHistory = {
  credits: { id: string; amount_kes: number; posted_at: string; booking_id: string | null; commission_rate: number | null }[];
  withholdingByBooking: Map<string, number>;
  /** ledger entry id → the payout it is on */
  payoutOf: Map<string, string>;
};

export async function getMoneyHistory(): Promise<MoneyHistory> {
  const empty: MoneyHistory = { credits: [], withholdingByBooking: new Map(), payoutOf: new Map() };
  if (!hasSupabase) return empty;
  const db = await serverClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return empty;
  const { data } = await db
    .from("ledger_entries")
    .select("id, amount_kes, posted_at, booking_id, commission_rate, account")
    .eq("counterparty_user_id", auth.user.id)
    .in("account", ["teacher_payable", "withholding_payable"])
    .eq("side", "credit")
    .order("posted_at", { ascending: false })
    .limit(5000);
  const rows = (data ?? []) as (MoneyHistory["credits"][number] & { account: string })[];
  const credits = rows.filter((r) => r.account === "teacher_payable").map((r) => ({ id: r.id, amount_kes: r.amount_kes, posted_at: r.posted_at, booking_id: r.booking_id, commission_rate: r.commission_rate === null ? null : Number(r.commission_rate) }));
  const withholdingByBooking = new Map<string, number>();
  for (const r of rows) if (r.account === "withholding_payable" && r.booking_id) withholdingByBooking.set(r.booking_id, (withholdingByBooking.get(r.booking_id) ?? 0) + r.amount_kes);
  const ids = credits.slice(0, 500).map((c) => c.id);
  const { data: lines } = ids.length ? await db.from("payout_lines").select("ledger_entry_id, payout_id").in("ledger_entry_id", ids) : { data: [] };
  const payoutOf = new Map(((lines ?? []) as { ledger_entry_id: string; payout_id: string }[]).map((l) => [l.ledger_entry_id, l.payout_id]));
  return { credits, withholdingByBooking, payoutOf };
}
