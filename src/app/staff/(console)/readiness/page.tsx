import type { Metadata } from "next";
import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { serverClient } from "@/lib/supabase/server";
import { hasAdmin } from "@/lib/supabase/admin";
import { testLogins } from "@/lib/supabase/config";
import { formatDate, formatTime } from "@/domain/format";

export const metadata: Metadata = { title: "Launch readiness", robots: { index: false } };

type Item = { label: string; state: "ok" | "todo" | "manual"; note?: string };

/**
 * S27: what must be true before real families pay (PLAN.md sprint 8; IDEA §12 pre-conditions).
 * Configuration is read from the server (presence only, never values); the rest from the database.
 * Manual items are checked off in LAUNCH.md.
 */
export default function ReadinessPage() {
  return (
    <Guarded next="/staff/readiness" anyOf={["admin"]}>
      <Readiness />
    </Guarded>
  );
}

function Row({ item }: { item: Item }) {
  const Icon = item.state === "ok" ? CheckCircle2 : item.state === "todo" ? CircleAlert : CircleDashed;
  return (
    <li className="flex items-start gap-3 border-b border-dashed border-line-2 py-3">
      <Icon size={20} aria-hidden="true" className={item.state === "ok" ? "text-forest" : item.state === "todo" ? "text-error" : "text-ink-2"} />
      <span className="flex flex-col">
        <span className={item.state === "todo" ? "font-semibold" : ""}>{item.label}</span>
        {item.note ? <span className="help">{item.note}</span> : null}
      </span>
      <span className="sr-only">{item.state === "ok" ? "done" : item.state === "todo" ? "not done" : "check by hand"}</span>
    </li>
  );
}

async function Readiness() {
  const db = await serverClient();
  const { data } = await db.rpc("readiness_checks");
  const r = (data ?? {}) as {
    staff_mfa_required?: boolean;
    last_reconciliation?: { status: string; at: string; findings: number } | null;
    whatsapp_templates_without_name?: number;
    policies?: { kind: string; version: string }[];
    teachers_approved?: number;
    teachers_bookable?: number;
    offers_live?: number;
    staff?: Record<string, number>;
    queued_messages?: number;
    failed_messages_7d?: number;
    dead_outbox?: number;
  };
  const env = (k: string) => !!process.env[k];
  const key = process.env.PAYSTACK_SECRET_KEY ?? "";
  const recentRecon = r.last_reconciliation && new Date(r.last_reconciliation.at).getTime() > new Date().getTime() - 48 * 3600_000;
  const kinds = new Set((r.policies ?? []).map((p) => p.kind));

  const config: Item[] = [
    { label: "Test logins are off", state: testLogins ? "todo" : "ok", note: testLogins ? "KOOBI_TEST_LOGINS must not be set in production." : undefined },
    { label: "Server key for Supabase", state: hasAdmin ? "ok" : "todo", note: "SUPABASE_SECRET_KEY: payments, payouts, uploads and messages need it." },
    { label: "Paystack live key", state: key.startsWith("sk_live_") ? "ok" : "todo", note: key ? "A test key is set; switch to the live key at launch." : "PAYSTACK_SECRET_KEY is not set." },
    { label: "Field encryption key", state: env("KOOBI_FIELD_KEY") ? "ok" : "todo", note: "KOOBI_FIELD_KEY protects KRA PINs, payout numbers and parent ID numbers." },
    { label: "Message dispatcher secret and app address", state: env("CRON_SECRET") && env("KOOBI_APP_URL") ? "ok" : "todo", note: "Also add both to Supabase Vault (koobi_cron_secret, koobi_dispatch_url)." },
    { label: "SMS (Africa's Talking)", state: env("AFRICASTALKING_API_KEY") && process.env.AFRICASTALKING_USERNAME !== "sandbox" ? "ok" : "todo" },
    { label: "Email receipts (Resend)", state: env("RESEND_API_KEY") && env("EMAIL_FROM") ? "ok" : "todo" },
    { label: "WhatsApp (optional at launch)", state: env("WHATSAPP_TOKEN") ? ((r.whatsapp_templates_without_name ?? 0) === 0 ? "ok" : "todo") : "manual", note: env("WHATSAPP_TOKEN") ? `${r.whatsapp_templates_without_name ?? 0} WhatsApp templates still need their approved name.` : "Not configured; SMS is used." },
  ];
  const database: Item[] = [
    { label: "Staff need their authenticator in the database too", state: r.staff_mfa_required ? "ok" : "todo", note: "Parameters: add staff_mfa_required = true from launch day." },
    {
      label: "Reconciliation passed in the last 48 hours",
      state: recentRecon && r.last_reconciliation?.status === "passed" ? "ok" : "todo",
      note: r.last_reconciliation ? `Last run ${formatDate(r.last_reconciliation.at)} ${formatTime(r.last_reconciliation.at)}: ${r.last_reconciliation.status}.` : "No run yet.",
    },
    { label: "Terms, privacy, cancellation and consent texts published", state: ["terms", "privacy", "cancellation_refund", "parental_consent"].every((k) => kinds.has(k)) ? "ok" : "todo", note: `Have: ${[...kinds].join(", ") || "none"}.` },
    { label: "Teachers approved and bookable", state: (r.teachers_bookable ?? 0) > 0 ? "ok" : "todo", note: `${r.teachers_approved ?? 0} approved, ${r.teachers_bookable ?? 0} bookable (ID and payout number checked), ${r.offers_live ?? 0} offers live.` },
    { label: "Staff in every role", state: ["concierge", "reviewer", "finance", "admin"].every((k) => (r.staff?.[k] ?? 0) > 0) && (r.staff?.finance ?? 0) + (r.staff?.admin ?? 0) >= 2 ? "ok" : "todo", note: "Payout batches need two different approvers from Finance or Admin." },
    { label: "Messages flowing", state: (r.failed_messages_7d ?? 0) === 0 && (r.dead_outbox ?? 0) === 0 ? "ok" : "todo", note: `${r.queued_messages ?? 0} queued, ${r.failed_messages_7d ?? 0} failed in 7 days, ${r.dead_outbox ?? 0} dead events.` },
  ];
  const manual: Item[] = [
    { label: "Written legal opinion: Basic Education Act s.37 and the TSC code", state: "manual" },
    { label: "Company registered with a KRA PIN; VAT decision recorded", state: "manual" },
    { label: "Paystack live account with M-Pesa collection and transfers", state: "manual" },
    { label: "ODPC registration started; privacy notice reviewed", state: "manual" },
    { label: "Teacher agreement, parent terms, cancellation rules, safeguarding policy signed off", state: "manual" },
    { label: "Supabase Phone sign-in with a live SMS provider", state: "manual" },
    { label: "Domain on Cloudflare, HTTPS, Vercel production environment variables", state: "manual" },
    { label: "Payouts tested end to end with a small real transfer", state: "manual" },
  ];
  const sections: [string, Item[]][] = [["Configuration", config], ["Database", database], ["Before the first payment (LAUNCH.md)", manual]];
  const open = [...config, ...database].filter((i) => i.state === "todo").length;
  return (
    <div className="flex max-w-[820px] flex-col gap-6">
      <h1 className="t1">Launch readiness</h1>
      <p className={`panel ${open ? "error" : "escrow"}`}>{open ? `${open} items to finish before real payments.` : "Configuration and database checks pass. Confirm the manual items."}</p>
      {sections.map(([title, items]) => (
        <section key={title} className="card flex flex-col p-5" aria-label={title}>
          <h2 className="t3 mb-1">{title}</h2>
          <ul className="flex flex-col">{items.map((i) => <Row key={i.label} item={i} />)}</ul>
        </section>
      ))}
    </div>
  );
}
