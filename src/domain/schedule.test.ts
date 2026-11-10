import { describe, expect, it } from "vitest";
import { label12, monthGrid, parseSchedule, rangesOn, shiftDay, shiftMonth, unionRanges, weekOf, weeklyMinutes } from "./schedule";

describe("weekly schedule", () => {
  it("accepts several ranges a day and sorts them", () => {
    const r = parseSchedule([
      { weekday: 1, starts: "14:00", ends: "17:00" },
      { weekday: 1, starts: "09:00", ends: "12:00" },
      { weekday: 2, starts: "09:00", ends: "17:00" },
    ]);
    expect("values" in r && r.values.map((x) => `${x.weekday} ${x.starts}`)).toEqual(["1 09:00", "1 14:00", "2 09:00"]);
  });
  it("lets ranges touch but not overlap", () => {
    expect("values" in parseSchedule([{ weekday: 1, starts: "09:00", ends: "12:00" }, { weekday: 1, starts: "12:00", ends: "13:00" }])).toBe(true);
    expect(parseSchedule([{ weekday: 1, starts: "09:00", ends: "12:00" }, { weekday: 1, starts: "11:30", ends: "13:00" }])).toEqual({ error: "On Monday, two time ranges overlap." });
  });
  it("rejects an end before the start and anything malformed", () => {
    expect(parseSchedule([{ weekday: 3, starts: "15:00", ends: "09:00" }])).toEqual({ error: "On Wednesday, the end time must be after the start." });
    expect("error" in parseSchedule([{ weekday: 9, starts: "09:00", ends: "10:00" }])).toBe(true);
    expect("error" in parseSchedule("nope")).toBe(true);
  });
  it("an empty week is valid: every day off", () => {
    expect(parseSchedule([])).toEqual({ values: [] });
  });
  it("merges the same range stored on several experiences and totals the week", () => {
    const u = unionRanges([
      { weekday: 1, starts: "09:00:00", ends: "12:00:00" },
      { weekday: 1, starts: "09:00", ends: "12:00" },
      { weekday: 5, starts: "09:00", ends: "15:00" },
    ]);
    expect(u).toHaveLength(2);
    expect(weeklyMinutes(u)).toBe(9 * 60);
  });
});

describe("calendar", () => {
  it("lays November 2026 out Monday first", () => {
    const g = monthGrid("2026-11");
    expect(g[0]).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(g.at(-1)![0]).toBe("2026-11-30");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
  it("a blocked date beats the weekly hours, whole day or part", () => {
    const weekly = [{ weekday: 1, starts: "09:00", ends: "17:00" }];
    expect(rangesOn("2026-11-16", weekly, [])).toHaveLength(1);
    expect(rangesOn("2026-11-16", weekly, [{ date: "2026-11-16", starts: null, ends: null }])).toEqual([]);
    expect(rangesOn("2026-11-16", weekly, [{ date: "2026-11-16", starts: "12:00", ends: "14:00" }]).map((r) => `${r.starts}-${r.ends}`)).toEqual(["09:00-12:00", "14:00-17:00"]);
    expect(rangesOn("2026-11-17", weekly, [])).toEqual([]);
  });
  it("adds extra hours on a date, and a block still wins", () => {
    const weekly = [{ weekday: 1, starts: "09:00", ends: "12:00" }];
    const extra = [{ date: "2026-11-17", starts: "08:00", ends: "10:00" }];
    expect(rangesOn("2026-11-17", weekly, [], extra).map((r) => `${r.starts}-${r.ends}`)).toEqual(["08:00-10:00"]);
    expect(rangesOn("2026-11-17", weekly, [{ date: "2026-11-17", starts: null, ends: null }], extra)).toEqual([]);
  });
  it("finds the Monday-first week of a date", () => {
    expect(weekOf("2026-11-15")).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
    expect(weekOf("2026-11-16")[0]).toBe("2026-11-16");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("shows times the way people say them", () => {
    expect(label12("09:00")).toBe("9:00 AM");
    expect(label12("14:30")).toBe("2:30 PM");
    expect(label12("12:00")).toBe("12:00 PM");
  });
});
