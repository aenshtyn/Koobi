import { describe, expect, it } from "vitest";
import { onlineRate, splitSession } from "./commission";
import { balances, paymentSucceeded, payoutSent, sessionConfirmed } from "./ledger";
import { canTransition, isBookable, transition } from "./listing";
import { formatKES, normaliseKenyanPhone } from "./format";

describe("IDEA §7 worked example: one KES 1,500 online session at 20%", () => {
  const journals = [paymentSucceeded(1500, 25), ...sessionConfirmed(1500, 0.2, true), payoutSent(1140, 20)];
  const b = balances(journals);

  it("splits the session as the PRD table says", () => {
    expect(splitSession({ priceKes: 1500, rate: 0.2, vatRegistered: true })).toEqual({
      price: 1500,
      commission: 300,
      teacherGross: 1200,
      withholding: 60,
      teacherNet: 1140,
      vatOnFee: 48,
    });
  });

  it("releases every shilling held and pays the teacher in full", () => {
    expect(b.client_funds_held).toBe(0);
    expect(b.teacher_payable).toBe(0);
    expect(b.withholding_payable).toBe(60);
    expect(b.vat_payable).toBe(48);
  });

  it("leaves about KES 255 before VAT and about 210 after", () => {
    const before = 300 - 20 - 25;
    expect(before).toBe(255);
    expect((b.revenue_commission ?? 0) - 20 - 25).toBe(207);
  });

  it("never spends client money", () => {
    const owed = (b.client_funds_held ?? 0) + (b.teacher_payable ?? 0) + (b.withholding_payable ?? 0) + (b.vat_payable ?? 0);
    expect(-(b.cash_provider ?? 0)).toBeGreaterThanOrEqual(owed);
  });
});

describe("commission rates", () => {
  it("slides with paid hours per pair", () => {
    expect(onlineRate(0)).toBe(0.2);
    expect(onlineRate(49.9)).toBe(0.2);
    expect(onlineRate(50)).toBe(0.15);
    expect(onlineRate(200)).toBe(0.12);
  });
  it("rejects fractional prices", () => {
    expect(() => splitSession({ priceKes: 99.5, rate: 0.2, vatRegistered: false })).toThrow();
  });
});

describe("listing machine", () => {
  it("allows the approval path and rejects shortcuts", () => {
    expect(transition("draft", "pending_review")).toBe("pending_review");
    expect(canTransition("draft", "approved")).toBe(false);
    expect(canTransition("retired", "draft")).toBe(false);
    expect(() => transition("rejected", "approved")).toThrow();
  });
  it("needs approval and the tier gate to be bookable", () => {
    expect(isBookable("approved", true)).toBe(true);
    expect(isBookable("approved", false)).toBe(false);
    expect(isBookable("pending_review", true)).toBe(false);
  });
});

describe("formatting", () => {
  it("writes KES with the code first", () => {
    expect(formatKES(12000)).toBe("KES 12,000");
  });
  it("normalises Kenyan phone numbers", () => {
    expect(normaliseKenyanPhone("0712 345 678")).toBe("+254712345678");
    expect(normaliseKenyanPhone("+254 112 345 678")).toBe("+254112345678");
    expect(normaliseKenyanPhone("12345")).toBeNull();
  });
});
