import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownLeft, ArrowRight, BadgeCheck, CalendarClock, CircleAlert, FileText, Hourglass, Info, LineChart, PieChart, Search, Smartphone, TrendingUp, Wallet } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { StatCard } from "@/components/app/stat-card";
import { EarningsChart } from "@/components/charts/earnings-chart";
import { getEarnings, getMoneyHistory, getMyTeacherPayout } from "@/lib/data/earnings";
import { getTeachingBookings } from "@/lib/data/bookings";
import { formatDate, formatKES, initials } from "@/domain/format";
import { PAYOUT_STATUS_LABELS } from "@/domain/payouts";
import { SERIES_VIEWS, breakdown, bucketOf, buckets, change, series, type SeriesView } from "@/domain/earnings";

export const metadata: Metadata = { title: "Earnings & Payouts" };

const RANGES = [
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
  ["all", "All time"],
] as const;
const TYPES = [
  ["all", "All types"],
  ["earning", "Lessons"],
  ["payout", "Payouts"],
] as const;
const STATUSES = [
  ["all", "All statuses"],
  ["released", "Released"],
  ["in_payout", "In a payout"],
  ["paid", "Paid"],
] as const;
const CHART_TITLE: Record<SeriesView, string> = { month: "the last six months", week: "the last eight weeks", year: "the last three years" };

type Txn = { id: string; kind: "earning" | "payout"; at: string; who: string; sub: string; state: "released" | "in_payout" | "paid" | "problem"; label: string; amount: number; href: string | null };
const TONE: Record<Txn["state"], string> = { released: "bg-fmt-1 text-orange-deep", in_payout: "bg-sand text-ink", paid: "bg-forest-tint text-forest-ink", problem: "bg-error-tint text-error" };

/** T22: what the expert earned, what is on its way, and every payout (FR-PAYOUT-1). */
export default function EarningsPage(props: PageProps<"/teach/earnings">) {
  return (
    <Guarded next="/teach/earnings">
      <Earnings searchParams={props.searchParams} />
    </Guarded>
  );
}

async function Earnings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const view = (SERIES_VIEWS.some(([v]) => v === one("view")) ? one("view") : "month") as SeriesView;
  const range = RANGES.some(([v]) => v === one("range")) ? one("range") : "90";
  const type = TYPES.some(([v]) => v === one("type")) ? one("type") : "all";
  const status = STATUSES.some(([v]) => v === one("status")) ? one("status") : "all";
  const q = one("q").slice(0, 80).trim();

  const [{ summary, payouts }, history, payout, bookings] = await Promise.all([getEarnings(), getMoneyHistory(), getMyTeacherPayout(), getTeachingBookings()]);
  const s = summary ?? { held_kes: 0, owed_kes: 0, in_payout_kes: 0, paid_kes: 0, threshold_kes: 500, next_payout_on: "" };
  const waiting = Math.max(s.owed_kes - s.in_payout_kes, 0);
  const blockers = [!payout.kraMasked ? "Add your KRA PIN" : null, payout.ownership !== "passed" ? "Prove your payout number" : null].filter(Boolean) as string[];

  const now = new Date();
  const months = buckets("month", now);
  const thisMonth = months.at(-1)!.key;
  const lastMonth = months.at(-2)!.key;
  const inMonth = (k: string) => history.credits.filter((c) => bucketOf("month", c.posted_at) === k);
  const monthCredits = inMonth(thisMonth);
  const earnedThis = monthCredits.reduce((n, c) => n + c.amount_kes, 0);
  const earnedLast = inMonth(lastMonth).reduce((n, c) => n + c.amount_kes, 0);
  const delta = change(earnedThis, earnedLast);
  const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "Africa/Nairobi" }).format(now);
  const split = breakdown(monthCredits, history.withholdingByBooking);
  const points = series(view, history.credits, now);

  // One list of money in and money out, newest first.
  const booking = new Map(bookings.map((b) => [b.id, b]));
  const payoutById = new Map(payouts.map((p) => [p.id, p]));
  const txns: Txn[] = [
    ...history.credits.map((c): Txn => {
      const b = c.booking_id ? booking.get(c.booking_id) : undefined;
      const po = payoutById.get(history.payoutOf.get(c.id) ?? "");
      const state = po ? (po.status === "sent" ? "paid" : "in_payout") : "released";
      return {
        id: c.id,
        kind: "earning",
        at: c.posted_at,
        who: b?.learner_alias ?? "Lesson",
        sub: b ? `${b.title} · ${formatDate(b.starts_at)}` : "Released lesson",
        state,
        label: state === "paid" ? "Paid" : state === "in_payout" ? "In a payout" : "Released",
        amount: c.amount_kes,
        href: b ? `/teach/bookings/${b.id}` : null,
      };
    }),
    ...payouts.map((p): Txn => {
      const state = p.status === "sent" ? "paid" : ["failed", "parked", "excluded"].includes(p.status) ? "problem" : "in_payout";
      return {
        id: p.id,
        kind: "payout",
        at: p.sent_at ?? p.created_at,
        who: "Payout to M-Pesa",
        sub: p.batch ? `Week of ${formatDate(p.batch.week_start)}` : "Weekly payout",
        state,
        label: PAYOUT_STATUS_LABELS[p.status] ?? p.status,
        amount: -p.net_kes,
        href: `/teach/statements/${p.id}`,
      };
    }),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const since = range === "all" ? 0 : now.getTime() - Number(range) * 86_400_000;
  const needle = q.toLowerCase();
  const shown = txns.filter(
    (t) =>
      new Date(t.at).getTime() >= since &&
      (type === "all" || t.kind === type) &&
      (status === "all" || t.state === status) &&
      (!needle || `${t.who} ${t.sub}`.toLowerCase().includes(needle)),
  );
  const filtered = range !== "90" || type !== "all" || status !== "all" || !!q;
  const viewHref = (v: SeriesView) => {
    const p = new URLSearchParams();
    if (v !== "month") p.set("view", v);
    for (const [k, val, def] of [["range", range, "90"], ["type", type, "all"], ["status", status, "all"], ["q", q, ""]] as const) if (val !== def) p.set(k, val);
    const qs = p.toString();
    return qs ? `/teach/earnings?${qs}` : "/teach/earnings";
  };
  const parts = [
    { key: "net", label: "Your earnings", value: split.net_kes, color: "var(--chart-1)" },
    { key: "fee", label: "Koobi’s fee", value: split.fee_kes, color: "var(--chart-2)" },
    { key: "tax", label: "Withholding tax", value: split.withholding_kes, color: "var(--chart-3)" },
  ];

  return (
    <div className="flex max-w-[1180px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-3">
          <h1 className="t1">Earnings & Payouts</h1>
          <p className="text-ink-2">What you have earned, what is on its way, and every payout to your M-Pesa.</p>
        </div>
        <Link className="btn2" href="/teach/statements">
          <FileText size={18} aria-hidden="true" />
          Payout statements
        </Link>
      </div>

      {blockers.length ? (
        <div className="panel error flex-wrap items-center">
          <CircleAlert size={20} aria-hidden="true" className="flex-none" />
          <span className="flex-1">Payouts are paused: {blockers.join(" and ").toLowerCase()}.</span>
          <Link className="btn3" href="/teach/settings">
            Open settings
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          value={formatKES(earnedThis)}
          label={`Earned in ${monthName}`}
          sub={delta === null ? "After the fee and tax" : `${delta >= 0 ? "Up" : "Down"} ${Math.abs(delta)}% on last month`}
        />
        <StatCard icon={Wallet} tone="forest" value={formatKES(waiting)} label="Released, next payout" sub={s.next_payout_on ? `Friday ${formatDate(s.next_payout_on)}` : "Paid weekly"} />
        <StatCard icon={Hourglass} value={formatKES(s.held_kes)} label="On hold for coming lessons" sub="What learners paid, before fee and tax" />
        <StatCard icon={BadgeCheck} tone="forest" value={formatKES(s.paid_kes)} label="Paid to M-Pesa" sub="All payouts so far" />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* ---------------------------------------------------------------- chart */}
          <section className="card flex flex-col gap-4 p-5" aria-labelledby="chart-h">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="chart-h" className="t3 flex items-center gap-2">
                <LineChart size={20} aria-hidden="true" />
                Earnings overview
              </h2>
              <nav className="flex gap-1.5" aria-label="Period">
                {SERIES_VIEWS.map(([v, label]) => (
                  <Link key={v} className={`chip sm${view === v ? " on" : ""}`} href={viewHref(v)} aria-current={view === v ? "page" : undefined} scroll={false}>
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
            <p className="help -mt-2">What you were paid for released lessons over {CHART_TITLE[view]}, after the fee and tax.</p>
            <EarningsChart points={points} caption={`Earnings over ${CHART_TITLE[view]}, in Kenya shillings`} />
          </section>

          {/* ---------------------------------------------------------------- transactions */}
          <section className="card flex flex-col gap-4 p-5" aria-labelledby="txn-h">
            <h2 id="txn-h" className="t3 flex items-center gap-2">
              <FileText size={20} aria-hidden="true" />
              Transaction history
            </h2>
            <form className="flex flex-wrap items-center gap-2.5" role="search">
              {view !== "month" ? <input type="hidden" name="view" value={view} /> : null}
              {(
                [
                  ["range", "Period", RANGES, range],
                  ["type", "Type", TYPES, type],
                  ["status", "Status", STATUSES, status],
                ] as const
              ).map(([name, label, options, value]) => (
                <span key={name} className="sel">
                  <select name={name} className="select min-h-[44px]! py-2! pr-9! text-[15px]!" defaultValue={value} aria-label={label}>
                    {options.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </span>
              ))}
              <span className="relative min-w-[180px] flex-1">
                <Search size={18} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-2" />
                <input name="q" className="input min-h-[44px]! py-2! pl-10! text-[15px]!" defaultValue={q} placeholder="Search by learner or lesson" aria-label="Search transactions" />
              </span>
              <button className="btn2 ink min-h-[44px]!" type="submit">
                Filter
              </button>
              {filtered ? (
                <Link className="btn3" href={view === "month" ? "/teach/earnings" : `/teach/earnings?view=${view}`}>
                  Clear
                </Link>
              ) : null}
            </form>
            {shown.length ? (
              <ul className="flex flex-col divide-y divide-dashed divide-line-2">
                {shown.slice(0, 60).map((t) => {
                  const row = (
                    <>
                      {t.kind === "payout" ? (
                        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-forest-tint text-forest-ink" aria-hidden="true">
                          <ArrowDownLeft size={18} />
                        </span>
                      ) : (
                        <span className="av sm" aria-hidden="true">
                          {initials(t.who)}
                        </span>
                      )}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-semibold">{t.who}</span>
                        <span className="truncate text-[13.5px] leading-5 text-ink-2">{t.sub}</span>
                      </span>
                      <span className="mono hidden w-[92px] flex-none text-[13.5px] text-ink-2 md:block">{formatDate(t.at)}</span>
                      <span className={`pill hidden flex-none sm:inline-flex ${TONE[t.state]}`}>{t.label}</span>
                      <span className="mono w-[104px] flex-none text-right font-medium">
                        {t.amount < 0 ? "− " : "+ "}
                        {formatKES(Math.abs(t.amount))}
                      </span>
                    </>
                  );
                  return (
                    <li key={`${t.kind}-${t.id}`}>
                      {t.href ? (
                        <Link href={t.href} className="flex items-center gap-3 py-3 text-ink no-underline hover:bg-orange-wash">
                          {row}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 py-3">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="empty">
                <Wallet size={24} aria-hidden="true" />
                <p className="font-semibold">{txns.length ? "Nothing matches these filters." : "No money has moved yet."}</p>
                <p className="help">
                  {txns.length ? "Try a longer period or clear the filters." : "A lesson is released when the learner confirms it, or 48 hours after your lesson note."}
                </p>
              </div>
            )}
            {shown.length > 60 ? <p className="help">Showing the newest 60. Narrow the period or search to find older ones.</p> : null}
          </section>
        </div>

        <div className="flex flex-col gap-6">
          {/* ---------------------------------------------------------------- payouts */}
          <section className="card flex flex-col gap-4 p-5" aria-labelledby="pay-h">
            <h2 id="pay-h" className="t3 flex items-center gap-2">
              <Wallet size={20} aria-hidden="true" />
              Your next payout
            </h2>
            <div className="flex flex-col">
              <span className="mono text-[32px] leading-10 tracking-tight">{formatKES(waiting)}</span>
              <span className="help">Released and waiting to be paid</span>
            </div>
            <p className="flex items-start gap-2.5 rounded-[14px] bg-forest-wash px-3.5 py-3 text-[14px] leading-5 text-forest-ink">
              <CalendarClock size={18} aria-hidden="true" className="mt-0.5 flex-none" />
              <span>
                Payouts are automatic. {s.next_payout_on ? <>The next one is on Friday <span className="mono">{formatDate(s.next_payout_on)}</span></> : "They go out every Friday"}, once at least{" "}
                <span className="mono">{formatKES(s.threshold_kes)}</span> is released. Smaller amounts wait a week.
              </span>
            </p>
            {s.in_payout_kes ? (
              <p className="flex items-center justify-between gap-3 text-[15px]">
                <span className="text-ink-2">In a payout now</span>
                <span className="mono">{formatKES(s.in_payout_kes)}</span>
              </p>
            ) : null}
            <div className="flex flex-col gap-2.5 border-t border-dashed border-line-2 pt-4">
              <h3 className="label">Your payout method</h3>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[12px] bg-forest-tint text-forest-ink" aria-hidden="true">
                  <Smartphone size={20} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">M-Pesa</span>
                  <span className="mono text-[14px] text-ink-2">{payout.masked ?? "No number yet"}</span>
                </span>
                {payout.masked ? (
                  <span className={`pill ${payout.ownership === "passed" ? "bg-forest-tint text-forest-ink" : "bg-sand"}`}>{payout.ownership === "passed" ? "Checked" : "Not checked"}</span>
                ) : null}
              </div>
              <Link className="btn3 self-start" href="/teach/verification/payout-number">
                {payout.masked ? "Change payout number" : "Add a payout number"} <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </section>

          {/* ---------------------------------------------------------------- breakdown */}
          <section className="card flex flex-col gap-4 p-5" aria-labelledby="split-h">
            <h2 id="split-h" className="t3 flex items-center gap-2">
              <PieChart size={20} aria-hidden="true" />
              Where the money went
            </h2>
            <p className="help -mt-2">Lessons released in {monthName}.</p>
            {split.gross_kes ? (
              <>
                <div className="flex h-4 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label} ${formatKES(p.value)}`).join(", ")}>
                  {parts
                    .filter((p) => p.value > 0)
                    .map((p) => (
                      <span key={p.key} style={{ flexGrow: p.value, background: p.color }} className="min-w-[4px] basis-0" />
                    ))}
                </div>
                <ul className="flex flex-col gap-2 text-[15px]">
                  {parts.map((p) => (
                    <li key={p.key} className="flex items-center gap-2.5">
                      <span className="h-3 w-3 flex-none rounded-[3px]" style={{ background: p.color }} aria-hidden="true" />
                      <span className="flex-1">{p.label}</span>
                      <span className="mono text-[13.5px] text-ink-2">{Math.round((p.value / split.gross_kes) * 100)}%</span>
                      <span className="mono w-[92px] text-right">{formatKES(p.value)}</span>
                    </li>
                  ))}
                  <li className="flex items-center gap-2.5 border-t border-dashed border-line-2 pt-2 font-semibold">
                    <span className="flex-1">Learners paid</span>
                    <span className="mono w-[92px] text-right font-medium">{formatKES(split.gross_kes)}</span>
                  </li>
                </ul>
              </>
            ) : (
              <p className="flex items-start gap-2.5 text-[15px] text-ink-2">
                <Info size={18} aria-hidden="true" className="mt-0.5 flex-none" />
                No lessons have been released this month yet.
              </p>
            )}
            <p className="help text-[13.5px]!">Koobi files the withholding tax with KRA for you. A trial lesson carries no fee.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
