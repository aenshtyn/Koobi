/**
 * Database functions raise plain sentences in lower case ("check-in opens 10 minutes before the
 * start"). Show them as sentences, and never show Postgres internals to people.
 */
export function friendly(message: string | undefined | null, fallback = "That did not work. Try again."): string {
  if (!message) return fallback;
  if (/permission denied|insufficient_privilege|not your/i.test(message)) return "You cannot do that on this lesson.";
  if (/violates|duplicate key|syntax|relation|column|function .* does not exist/i.test(message)) return fallback;
  const m = message.trim();
  const s = m.charAt(0).toUpperCase() + m.slice(1);
  return /[.!?]$/.test(s) ? s : `${s}.`;
}
