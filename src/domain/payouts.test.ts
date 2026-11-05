import { describe, expect, it } from "vitest";
import { normaliseKraPin } from "./payouts";

describe("KRA PIN", () => {
  it("accepts the letter-nine-digits-letter format, tidied", () => {
    expect(normaliseKraPin(" a012345678z ")).toBe("A012345678Z");
    expect(normaliseKraPin("P051234567Q")).toBe("P051234567Q");
  });
  it("rejects anything else", () => {
    expect(normaliseKraPin("A01234567Z")).toBeNull();
    expect(normaliseKraPin("12345678901")).toBeNull();
    expect(normaliseKraPin("B012345678Z")).toBeNull();
  });
});
