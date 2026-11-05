/** Formatting rules: KES or USD with the code first, one currency per screen; 24-hour Nairobi time. */

const kes = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 });

export function formatKES(amount: number): string {
  return `KES ${kes.format(Math.round(amount))}`;
}

export function formatUSD(amount: number): string {
  const n = new Intl.NumberFormat("en-US", { maximumFractionDigits: amount % 1 === 0 ? 0 : 2 });
  return `USD ${n.format(amount)}`;
}

export const TIME_ZONE = "Africa/Nairobi";

function toDate(d: string | Date): Date {
  return typeof d === "string" ? new Date(d) : d;
}

/** 3 Nov 2026 */
export function formatDate(d: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE }).format(toDate(d));
}

/** 3 Nov (badge on a card) */
export function formatDayMonth(d: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: TIME_ZONE }).format(toDate(d));
}

/** Mon 16 Nov */
export function formatWeekday(d: string | Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TIME_ZONE }).formatToParts(toDate(d));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

/** 18:00 */
export function formatTime(d: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIME_ZONE }).format(toDate(d));
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h === 1 ? "1 hour" : `${h} hours`;
  return m ? `${hours} ${m} minutes` : hours;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Kenyan mobile numbers to E.164: 0712 345 678, 712345678, +254712345678 → +254712345678 */
export function normaliseKenyanPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  let local: string;
  if (digits.startsWith("+254")) local = digits.slice(4);
  else if (digits.startsWith("254")) local = digits.slice(3);
  else if (digits.startsWith("0")) local = digits.slice(1);
  else local = digits;
  if (!/^(7|1)\d{8}$/.test(local)) return null;
  return `+254${local}`;
}
