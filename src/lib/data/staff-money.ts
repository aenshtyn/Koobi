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

// ---------------------------------------------------------------------------
// Sprint 6: payout batches (S13) and reconciliation (S15)

export type Batch = {
  id: string;
  week_start: string;
  cutoff_at: string;
  status: string;
  teacher_count: number;
  gross_kes: number;
  withholding_kes: number;
  net_kes: number;
  fees_kes: number;
  approved_by: string | null;
  second_approver: string | null;
  approved_at: string | null;
};

export type BatchPayout = {
  id: string;
  status: string;
  gross_kes: number;
  platform_fee_kes: number;
  withholding_kes: number;
  net_kes: number;
  transfer_fee_kes: number;
  exclusion_reason: string | null;
  attempts: number;
  last_error: string | null;
  sent_at: string | null;
  teacher: { display_name: string; slug: string } | null;
};

const BATCH_COLS = "id, week_start, cutoff_at, status, teacher_count, gross_kes, withholding_kes, net_kes, fees_kes, approved_by, second_approver, approved_at";

export async function getBatches(): Promise<Batch[]> {
  if (!hasSupabase) return [];
  const db = await serverClient();
  const { data, error } = await db.from("payout_batches").select(BATCH_COLS).order("week_start", { ascending: false }).limit(26);
  if (error) throw new Error(`payout_batches: ${error.message}`);
  return (data ?? []) as Batch[];
}

export async function getBatch(id: string): Promise<{ batch: Batch; payouts: BatchPayout[]; approvers: Record<string, string> } | null> {
  if (!hasSupabase || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const db = await serverClient();
  const { data: batch } = await db.from("payout_batches").select(BATCH_COLS).eq("id", id).maybeSingle();
  if (!batch) return null;
  const { data: payouts } = await db
    .from("payouts")
    .select("id, status, gross_kes, platform_fee_kes, withholding_kes, net_kes, transfer_fee_kes, exclusion_reason, attempts, last_error, sent_at, teacher:teachers(display_name, slug)")
    .eq("batch_id", id)
    .order("net_kes", { ascending: false });
  const ids = [batch.approved_by, batch.second_approver].filter(Boolean) as string[];
  const { data: people } = ids.length ? await db.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
  return {
    batch: batch as Batch,
    payouts: (payouts ?? []) as unknown as BatchPayout[],
    approvers: Object.fromEntries(((people ?? []) as { id: string; display_name: string | null }[]).map((p) => [p.id, p.display_name ?? "Staff"])),
  };
}

export type ReconRun = { id: string; run_on: string; status: string; findings: Record<string, unknown>[]; created_at: string };
export type Adjustment = {
  id: string;
  status: string;
  reason: string;
  proposed_entries: { account: string; side: string; amount_kes: number }[];
  requested_by: string;
  approved_by: string | null;
  created_at: string;
  decided_at: string | null;
};

export async function getReconciliation(): Promise<{ runs: ReconRun[]; adjustments: Adjustment[] }> {
  if (!hasSupabase) return { runs: [], adjustments: [] };
  const db = await serverClient();
  const [runs, adjustments] = await Promise.all([
    db.from("reconciliation_runs").select("id, run_on, status, findings, created_at").order("created_at", { ascending: false }).limit(30),
    db
      .from("ledger_adjustment_requests")
      .select("id, status, reason, proposed_entries, requested_by, approved_by, created_at, decided_at")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  if (runs.error) throw new Error(`reconciliation_runs: ${runs.error.message}`);
  return { runs: (runs.data ?? []) as ReconRun[], adjustments: (adjustments.data ?? []) as Adjustment[] };
}
