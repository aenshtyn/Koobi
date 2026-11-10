/**
 * Database functions raise plain sentences in lower case ("check-in opens 10 minutes before the
 * start"). Show them as sentences, and never show Postgres internals to people.
 */
export function friendly(message: string | undefined | null, fallback = "That did not work. Try again."): string {
  if (!message) return fallback;
  if (/permission denied|insufficient_privilege|not your/i.test(message)) return "You cannot do that on this lesson.";
  if (/violates|duplicate key|syntax|relation|column|function .* does not exist/i.test(message)) return fallback;
  // The database still says "offer" and "offering"; people see "learning experience".
  const m = message.trim().replace(/\bofferings?\b|\boffers?\b/gi, (w) => (/s$/i.test(w) ? "learning experiences" : "learning experience"));
  const s = m.charAt(0).toUpperCase() + m.slice(1);
  return /[.!?]$/.test(s) ? s : `${s}.`;
}
