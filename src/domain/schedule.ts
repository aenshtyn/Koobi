/**
 * The expert's weekly schedule (Availability & Schedule). One schedule per expert: it is stored once
 * per learning experience, and every one-to-one experience carries the same ranges. Times are Nairobi
 * local time, "HH:MM". Weekday 0 is Sunday, as in the database.
 */

export type Range = { weekday: number; starts: string; ends: string };
export type Blocked = { date: string; starts: string | null; ends: string | null };

export const TIME_ZONE = "Africa/Nairobi";
/** Monday first, as a Kenyan week is read. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const MAX_RANGES_PER_DAY = 4;

/** The booking rules every expert starts with; each can change their own (Availability & Schedule). */
export const BOOKING_RULES = { minNoticeHours: 2, advanceDays: 28, bufferMinutes: 0 } as const;
export type BookingPrefs = { min_notice_hours: number; advance_days: number; buffer_minutes: number };
export const NOTICE_OPTIONS = [2, 4, 6, 12, 24, 48, 72] as const;
export const ADVANCE_OPTIONS = [7, 14, 28, 42, 60] as const;
export const BUFFER_OPTIONS = [0, 10, 15, 30, 45, 60] as const;
export const CALENDAR_VIEWS = [
  ["month", "Month"],
  ["week", "Week"],
  ["day", "Day"],
] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number][0];

/** 06:00 to 22:00 in half hours: what the editor offers. */
export const TIME_OPTIONS: string[] = Array.from({ length: 33 }, (_, i) => {
  const m = 6 * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const isTime = (t: unknown): t is string => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

export function label12(t: string): string {
  const h = Number(t.slice(0, 2));
  return `${((h + 11) % 12) + 1}:${t.slice(3, 5)} ${h < 12 ? "AM" : "PM"}`;
}

/** Checks a whole week sent from the editor. Ranges on one day may touch but not overlap. */
export function parseSchedule(input: unknown): { values: Range[] } | { error: string } {
  if (!Array.isArray(input)) return { error: "The schedule could not be read. Try again." };
  const out: Range[] = [];
  for (const r of input) {
    const { weekday, starts, ends } = (r ?? {}) as Partial<Range>;
    if (!Number.isInteger(weekday) || weekday! < 0 || weekday! > 6 || !isTime(starts) || !isTime(ends)) return { error: "Choose a start and end time for every range." };
    if (starts >= ends) return { error: `On ${DAY_NAMES[weekday!]}, the end time must be after the start.` };
    out.push({ weekday: weekday!, starts, ends });
  }
  for (const d of WEEK_ORDER) {
    const day = out.filter((r) => r.weekday === d).sort((a, b) => a.starts.localeCompare(b.starts));
    if (day.length > MAX_RANGES_PER_DAY) return { error: `Up to ${MAX_RANGES_PER_DAY} time ranges a day.` };
    for (let i = 1; i < day.length; i++) if (day[i].starts < day[i - 1].ends) return { error: `On ${DAY_NAMES[d]}, two time ranges overlap.` };
  }
  return { values: out.sort((a, b) => a.weekday - b.weekday || a.starts.localeCompare(b.starts)) };
}

/** The distinct ranges across every experience's stored windows. */
export function unionRanges(rows: Range[]): Range[] {
  const seen = new Map<string, Range>();
  for (const r of rows) {
    const x = { weekday: r.weekday, starts: r.starts.slice(0, 5), ends: r.ends.slice(0, 5) };
    seen.set(`${x.weekday}|${x.starts}|${x.ends}`, x);
  }
  return [...seen.values()].sort((a, b) => a.weekday - b.weekday || a.starts.localeCompare(b.starts));
}

export function weeklyMinutes(ranges: Range[]): number {
  return ranges.reduce((s, r) => s + minutes(r.ends) - minutes(r.starts), 0);
}

/** "YYYY-MM-DD" in Nairobi for an instant. */
export function dayKey(d: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TIME_ZONE }).format(typeof d === "string" ? new Date(d) : d);
}

/** Weeks of a month as date keys, Monday first; days outside the month are null. */
export function monthGrid(month: string): (string | null)[][] {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** A date-specific block beats the weekly hours: the whole day, or the hours it covers. */
export function rangesOn(date: string, weekly: Range[], blocked: Blocked[], extra: Blocked[] = []): Range[] {
  const blocks = blocked.filter((b) => b.date === date);
  if (blocks.some((b) => !b.starts)) return [];
  const day = weekdayOf(date);
  const extras = extra.filter((e) => e.date === date && e.starts && e.ends).map((e) => ({ weekday: day, starts: e.starts!, ends: e.ends! }));
  return [...weekly.filter((r) => r.weekday === day), ...extras]
    .sort((a, b) => a.starts.localeCompare(b.starts))
    .flatMap((r) => {
      let parts = [{ starts: r.starts, ends: r.ends }];
      for (const b of blocks) {
        parts = parts.flatMap((p) => {
          if (b.ends! <= p.starts || b.starts! >= p.ends) return [p];
          return [
            ...(b.starts! > p.starts ? [{ starts: p.starts, ends: b.starts! }] : []),
            ...(b.ends! < p.ends ? [{ starts: b.ends!, ends: p.ends }] : []),
          ];
        });
      }
      return parts.map((p) => ({ weekday: r.weekday, ...p }));
    });
}

/** Move a date key by whole days. */
export function shiftDay(date: string, by: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

/** The seven date keys of the week that holds a date, Monday first. */
export function weekOf(date: string): string[] {
  const monday = shiftDay(date, -((weekdayOf(date) + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
}
