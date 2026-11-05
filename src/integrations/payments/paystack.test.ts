import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fromSubunits, mpesaPhone, toSubunits, verifyPaystackSignature } from "./paystack";

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
});
