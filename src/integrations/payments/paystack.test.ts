import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fromSubunits, localPhone, mpesaPhone, refundStatus, toSubunits, transferStatus, verifyPaystackSignature } from "./paystack";

describe("Paystack adapter", () => {
  const secret = "sk_test_example";
  const body = JSON.stringify({ event: "charge.success", data: { reference: "KB261106-ABC" } });
  const good = createHmac("sha512", secret).update(body).digest("hex");

  it("accepts a correctly signed webhook and rejects tampering", () => {
    expect(verifyPaystackSignature(body, good, secret)).toBe(true);
    expect(verifyPaystackSignature(body.replace("ABC", "ABD"), good, secret)).toBe(false);
    expect(verifyPaystackSignature(body, null, secret)).toBe(false);
    expect(verifyPaystackSignature(body, "00", secret)).toBe(false);
  });
  it("converts KES to subunits and back", () => {
    expect(toSubunits(1500)).toBe(150000);
    expect(fromSubunits(2250)).toBe(23);
  });
  it("formats M-Pesa numbers with a plus", () => {
    expect(mpesaPhone("254712345678")).toBe("+254712345678");
    expect(mpesaPhone("+254712345678")).toBe("+254712345678");
  });
  it("treats only processed refunds as done", () => {
    expect(refundStatus("processed")).toEqual({ status: "processed" });
    expect(refundStatus("failed").status).toBe("failed");
    expect(refundStatus("needs-attention")).toEqual({ status: "pending" });
    expect(refundStatus(undefined)).toEqual({ status: "pending" });
  });
  it("sends M-Pesa recipients in the local form", () => {
    expect(localPhone("+254712345678")).toBe("0712345678");
    expect(localPhone("254112345678")).toBe("0112345678");
  });
  it("treats only a successful transfer as paid", () => {
    expect(transferStatus("success", 4000)).toEqual({ status: "success", feeKes: 40 });
    expect(transferStatus("reversed").status).toBe("failed");
    expect(transferStatus("otp")).toEqual({ status: "pending" });
  });
});
