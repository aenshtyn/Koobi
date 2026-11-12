/** The choices on the public "Request a match" form, shared by the form, its action and the staff console. */

export const TIMES = ["morning", "afternoon", "evening", "flexible"] as const;
export const TIME_LABELS: Record<string, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", flexible: "Flexible" };

export const DAYS = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
] as const;

/** Value is the format code stored on the request; "unsure" is stored as no preference. */
export const FORMAT_CHOICES = [
  ["one_to_one", "One-to-one lessons"],
  ["small_group", "Group classes"],
  ["workshop", "Workshops"],
  ["cohort", "Structured programmes"],
  ["unsure", "Not sure yet"],
] as const;

export const formatChoiceLabel = (code: string | null | undefined) => FORMAT_CHOICES.find(([v]) => v === (code ?? "unsure"))?.[1] ?? "Not sure yet";

/** Budget per session in KES; empty means "Not sure yet". */
export const BUDGETS = ["", "1000", "2000", "5000"] as const;
