import { describe, expect, it } from "vitest";
import { cleanEmail, landingFor, lockoutMessage, passwordProblem, safeNext, sessionAgeHours, sessionLimitHours, sessionStartedAt } from "./account";

const token = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;

describe("account rules", () => {
  it("asks for a password of at least ten characters", () => {
    expect(passwordProblem("short")).toMatch(/at least 10/);
    expect(passwordProblem("aaaaaaaaaaaa")).toMatch(/harder to guess/);
    expect(passwordProblem("x".repeat(80))).toMatch(/at most 72/);
    expect(passwordProblem("maziwa-lala-42")).toBeNull();
  });
  it("cleans an email address or refuses it", () => {
    expect(cleanEmail("  Amina@Example.COM ")).toBe("amina@example.com");
    expect(cleanEmail("amina@")).toBeNull();
    expect(cleanEmail("a b@example.com")).toBeNull();
  });
  it("only returns to pages inside the app", () => {
    expect(safeNext("/offers/excel?book=1")).toBe("/offers/excel?book=1");
    expect(safeNext("//evil.example")).toBe("/home");
    expect(safeNext("https://evil.example")).toBe("/home");
    expect(safeNext("/\\evil.example")).toBe("/home");
    expect(safeNext(undefined, "/staff")).toBe("/staff");
  });
  it("sends a new person back where they started, or to the page for what they chose", () => {
    expect(landingFor("self", "/teachers/amina")).toBe("/teachers/amina");
    expect(landingFor("teach", null)).toBe("/teach/apply");
    expect(landingFor("teach", "/home")).toBe("/teach/apply");
    expect(landingFor("child", null)).toBe("/account/learners/new");
    expect(landingFor("self", null)).toBe("/home");
  });
  it("limits a session by the strictest role", () => {
    expect(sessionLimitHours(["learner"])).toBe(720);
    expect(sessionLimitHours(["guardian", "learner"])).toBe(720);
    expect(sessionLimitHours(["learner", "teacher"])).toBe(168);
    expect(sessionLimitHours(["teacher", "concierge"])).toBe(12);
    expect(sessionLimitHours([])).toBe(720);
  });
  it("reads when a session began from the first sign-in step", () => {
    const t = token({ amr: [{ method: "totp", timestamp: 1_800_000_500 }, { method: "password", timestamp: 1_800_000_000 }] });
    expect(sessionStartedAt(t)?.getTime()).toBe(1_800_000_000_000);
    expect(sessionStartedAt("nonsense")).toBeNull();
    expect(sessionStartedAt(token({}))).toBeNull();
    expect(sessionAgeHours(new Date(0), new Date(13 * 3_600_000))).toBe(13);
  });
  it("says how long a locked address must wait", () => {
    expect(lockoutMessage(900)).toMatch(/15 minutes/);
    expect(lockoutMessage(20)).toMatch(/1 minute /);
  });
});
