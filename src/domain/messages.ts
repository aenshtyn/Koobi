/**
 * Message rendering (FR-NOTIF-2, -3, -5). Templates hold placeholders; payloads hold allow-listed fields.
 * Every time is written in the recipient's time zone with the zone named; links become absolute.
 */
import { formatKES } from "./format";

export type Payload = Record<string, unknown>;

const ZONE_NAMES: Record<string, string> = { "Africa/Nairobi": "EAT" };

export function whenIn(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(d);
  return `${day}, ${time} ${ZONE_NAMES[timeZone] ?? timeZone}`;
}

export function render(body: string, payload: Payload, opts: { timeZone: string; baseUrl: string }): string {
  return body.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = payload[key];
    if (v === undefined || v === null || v === "") return "";
    if (key === "when") return whenIn(String(v), opts.timeZone);
    if (key === "amount") return formatKES(Number(v));
    if (key === "link") return `${opts.baseUrl}${String(v)}`;
    return String(v);
  }).replace(/\s{2,}/g, " ").trim();
}

/** Quiet hours 21:00–07:00 in the recipient's zone [assumption, FR-NOTIF-3]; urgent messages are exempt. */
export function inQuietHours(now: Date, timeZone: string, start = 21, end = 7): boolean {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone }).format(now));
  return start > end ? h >= start || h < end : h >= start && h < end;
}

/** WhatsApp template parameters, in the order the placeholders appear. */
export function orderedParams(body: string, payload: Payload, opts: { timeZone: string; baseUrl: string }): string[] {
  return [...body.matchAll(/\{(\w+)\}/g)].map((m) => render(`{${m[1]}}`, payload, opts));
}
