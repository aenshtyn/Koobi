import { describe, expect, it } from "vitest";
import { PAGES, findPage, pagesIn } from "./pages";

describe("page registry", () => {
  it("lists 122 screens in the agreed split (109 planned, plus launch readiness, the expert Business, Account, Tips and Group details pages, and the eight learner workspace pages)", () => {
    expect(PAGES).toHaveLength(122);
    expect(pagesIn("public")).toHaveLength(16);
    expect(pagesIn("auth")).toHaveLength(3);
    expect(pagesIn("learner")).toHaveLength(34);
    expect(pagesIn("teacher")).toHaveLength(32);
    expect(pagesIn("staff")).toHaveLength(27);
    expect(pagesIn("system")).toHaveLength(10);
  });
  it("has unique ids and routes", () => {
    expect(new Set(PAGES.map((p) => p.id)).size).toBe(PAGES.length);
    const routes = PAGES.map((p) => p.route).filter(Boolean);
    expect(new Set(routes).size).toBe(routes.length);
  });
  it("resolves concrete paths, preferring static segments", () => {
    expect(findPage("/teach/offers/new")?.id).toBe("T12");
    expect(findPage("/bookings/abc/confirmed")?.id).toBe("L8");
    expect(findPage("/offers/business-english")?.id).toBe("P4");
    expect(findPage("/nope")).toBeUndefined();
  });
});
