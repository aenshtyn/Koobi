import { describe, expect, it } from "vitest";
import { cancelPreview, checkinWindow, graceOver, problemTypesFor } from "./booking";

const now = new Date("2026-11-10T08:00:00Z");
const at = (h: number) => new Date(now.getTime() + h * 3600_000).toISOString();

describe("cancellation preview", () => {
  it("credits in full a day or more ahead", () => {
    expect(cancelPreview("scheduled", at(30), now, "Amina").kind).toBe("credit");
    expect(cancelPreview("scheduled", at(24), now, "Amina").kind).toBe("credit");
  });
  it("pays the teacher inside 24 hours", () => {
    expect(cancelPreview("scheduled", at(5), now, "Amina").kind).toBe("released");
  });
  it("always credits before the teacher accepts", () => {
    expect(cancelPreview("paid", at(1), now, "Amina").kind).toBe("credit");
  });
  it("is free before payment and closed after the start", () => {
    expect(cancelPreview("awaiting_payment", at(1), now, "Amina").kind).toBe("free");
    expect(cancelPreview("in_progress", at(-1), now, "Amina").kind).toBe("closed");
  });
});

describe("lesson day", () => {
  it("opens check-in ten minutes before and closes two hours after the end", () => {
    expect(checkinWindow(at(1), at(2), now).state).toBe("early");
    expect(checkinWindow(at(0.1), at(1.1), now).state).toBe("open");
    expect(checkinWindow(at(-4), at(-3), now).state).toBe("late");
  });
  it("waits 15 minutes before an absence can be reported", () => {
    expect(graceOver(at(-0.2), now)).toBe(false);
    expect(graceOver(at(-0.25), now)).toBe(true);
  });
  it("offers the problems that fit the lesson's state", () => {
    expect(problemTypesFor("awaiting_confirmation", at(-2), now)).toContain("short_session");
    expect(problemTypesFor("no_show_learner", at(-2), now)).toEqual(["exception_request"]);
    expect(problemTypesFor("scheduled", at(-0.5), now)).toEqual(["teacher_no_show"]);
    expect(problemTypesFor("scheduled", at(-0.1), now)).toEqual([]);
    expect(problemTypesFor("confirmed", at(-2), now)).toEqual([]);
  });
});
