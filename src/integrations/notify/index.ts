import "server-only";
import { testLogins } from "@/lib/supabase/config";

/**
 * Outside channels (FR-NOTIF-1): SMS by Africa's Talking, WhatsApp by the Cloud API (approved templates
 * only), email by Resend. Without keys, development and test-login deployments use a sandbox that sends
 * nothing and records the message as sent by "sandbox"; production without keys records "not_configured".
 */
export type SendResult = { ok: true; vendor: string; id: string | null; costCents?: number | null } | { ok: false; vendor: string; reason: string };

const sandboxOn = () => process.env.NODE_ENV !== "production" || testLogins;

export async function sendSms(to: string, text: string): Promise<SendResult> {
  const user = process.env.AFRICASTALKING_USERNAME;
  const key = process.env.AFRICASTALKING_API_KEY;
  if (!user || !key) return sandboxOn() ? { ok: true, vendor: "sandbox", id: null } : { ok: false, vendor: "not_configured", reason: "SMS is not configured." };
  const host = user === "sandbox" ? "https://api.sandbox.africastalking.com" : "https://api.africastalking.com";
  const body = new URLSearchParams({ username: user, to, message: text });
  if (process.env.AFRICASTALKING_SENDER_ID) body.set("from", process.env.AFRICASTALKING_SENDER_ID);
  const res = await fetch(`${host}/version1/messaging`, {
    method: "POST",
    headers: { apiKey: key, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { SMSMessageData?: { Recipients?: { status: string; messageId: string; cost: string }[] } } | null;
  const r = json?.SMSMessageData?.Recipients?.[0];
  if (!res.ok || !r || !/success|sent/i.test(r.status)) return { ok: false, vendor: "africastalking", reason: r?.status ?? `HTTP ${res.status}` };
  const cost = Number((r.cost ?? "").replace(/[^0-9.]/g, ""));
  return { ok: true, vendor: "africastalking", id: r.messageId, costCents: Number.isFinite(cost) ? Math.round(cost * 100) : null };
}

export async function sendWhatsApp(to: string, templateName: string, params: string[], locale: string): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return sandboxOn() ? { ok: true, vendor: "sandbox", id: null } : { ok: false, vendor: "not_configured", reason: "WhatsApp is not configured." };
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to.replace(/^\+/, ""),
      type: "template",
      template: { name: templateName, language: { code: locale === "sw" ? "sw" : "en" }, components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] },
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { messages?: { id: string }[]; error?: { message: string } } | null;
  if (!res.ok || !json?.messages?.[0]) return { ok: false, vendor: "whatsapp", reason: json?.error?.message ?? `HTTP ${res.status}` };
  return { ok: true, vendor: "whatsapp", id: json.messages[0].id };
}

export async function sendEmail(to: string, subject: string, text: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return sandboxOn() ? { ok: true, vendor: "sandbox", id: null } : { ok: false, vendor: "not_configured", reason: "Email is not configured." };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!res.ok || !json?.id) return { ok: false, vendor: "resend", reason: json?.message ?? `HTTP ${res.status}` };
  return { ok: true, vendor: "resend", id: json.id };
}
