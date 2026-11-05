import "server-only";
import { adminClient, hasAdmin } from "@/lib/supabase/admin";
import { inQuietHours, orderedParams, render, type Payload } from "@/domain/messages";
import { sendEmail, sendSms, sendWhatsApp } from "@/integrations/notify";
import { brand } from "@/config/brand";

/**
 * The dispatcher (FR-NOTIF-1..5). The database decides who is told what; this sends the queued SMS,
 * WhatsApp and email rows. A failed WhatsApp message falls back to SMS. Non-urgent messages wait out
 * quiet hours. Safe to run any number of times: rows are claimed with SKIP LOCKED.
 */
type Row = { id: string; user_id: string; template: string; locale: string; channel: "sms" | "whatsapp" | "email"; entity_type: string | null; entity_id: string | null; payload: Payload; recipient_time_zone: string };
type Template = { key: string; channel: string; locale: string; subject: string | null; body: string; whatsapp_template_name: string | null; urgent: boolean };

const baseUrl = () => process.env.KOOBI_APP_URL ?? `https://${brand.domain}`;

export async function dispatchQueued(limit = 50): Promise<{ sent: number; failed: number; held: number }> {
  if (!hasAdmin) return { sent: 0, failed: 0, held: 0 };
  const admin = adminClient();
  const { data: rows, error } = await admin.rpc("claim_notifications", { p_limit: limit });
  if (error) throw new Error(`claim_notifications: ${error.message}`);
  const claimed = (rows ?? []) as Row[];
  if (!claimed.length) return { sent: 0, failed: 0, held: 0 };
  const [{ data: templates }, { data: people }] = await Promise.all([
    admin.from("message_templates").select("key, channel, locale, subject, body, whatsapp_template_name, urgent").eq("active", true),
    admin.from("profiles").select("id, phone_e164, email, time_zone").in("id", [...new Set(claimed.map((r) => r.user_id))]),
  ]);
  const tpl = (key: string, channel: string, locale: string) =>
    ((templates ?? []) as Template[]).find((t) => t.key === key && t.channel === channel && t.locale === locale) ??
    ((templates ?? []) as Template[]).find((t) => t.key === key && t.channel === channel && t.locale === "en");
  const person = (id: string) => ((people ?? []) as { id: string; phone_e164: string | null; email: string | null; time_zone: string }[]).find((p) => p.id === id);

  let sent = 0, failed = 0, held = 0;
  for (const r of claimed) {
    const p = person(r.user_id);
    const t = tpl(r.template, r.channel, r.locale);
    const tz = p?.time_zone ?? r.recipient_time_zone ?? "Africa/Nairobi";
    if (!p || !t) {
      await admin.rpc("record_notification", { p_id: r.id, p_status: "failed", p_vendor: "none", p_vendor_msg_id: null, p_cost_cents: null });
      failed++;
      continue;
    }
    if (!t.urgent && inQuietHours(new Date(), tz)) {
      await admin.rpc("requeue_notification", { p_id: r.id });
      held++;
      continue;
    }
    const opts = { timeZone: tz, baseUrl: baseUrl() };
    let res;
    if (r.channel === "sms" && p.phone_e164) res = await sendSms(p.phone_e164, render(t.body, r.payload, opts));
    else if (r.channel === "email" && p.email) res = await sendEmail(p.email, t.subject ?? brand.name, render(t.body, r.payload, opts));
    else if (r.channel === "whatsapp" && p.phone_e164 && t.whatsapp_template_name) {
      res = await sendWhatsApp(p.phone_e164, t.whatsapp_template_name, orderedParams(t.body, r.payload, opts), r.locale);
      if (!res.ok) {
        // Fallback to SMS (FR-NOTIF-2): send it now and mark the WhatsApp row as fallen back.
        const sms = tpl(r.template, "sms", r.locale);
        if (sms) {
          const fb = await sendSms(p.phone_e164, render(sms.body, r.payload, opts));
          await admin.rpc("record_notification", { p_id: r.id, p_status: fb.ok ? "fallback_sent" : "failed", p_vendor: fb.vendor, p_vendor_msg_id: fb.ok ? fb.id : null, p_cost_cents: fb.ok ? fb.costCents ?? null : null });
          if (fb.ok) sent++;
          else failed++;
          continue;
        }
      }
    } else res = { ok: false as const, vendor: "none", reason: "no address" };
    await admin.rpc("record_notification", {
      p_id: r.id,
      p_status: res.ok ? "sent" : "failed",
      p_vendor: res.vendor,
      p_vendor_msg_id: res.ok ? res.id : null,
      p_cost_cents: res.ok ? res.costCents ?? null : null,
    });
    if (res.ok) sent++;
    else failed++;
  }
  return { sent, failed, held };
}
