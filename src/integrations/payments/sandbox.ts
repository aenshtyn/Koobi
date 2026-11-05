import type { PaymentProvider } from "./types";

/**
 * Sandbox provider for development and test deployments without Paystack keys. Nothing leaves the
 * server and no money moves: the status page offers a "simulate" button that records the payment
 * through the same database function a verified webhook uses, with a 1.5% fee like M-Pesa via Paystack.
 */
export const SANDBOX_FEE_RATE = 0.015;

export const sandbox: PaymentProvider = {
  name: "sandbox",
  async startMpesa({ reference }) {
    return { ok: true, providerRef: `sandbox_${reference}`, displayText: "Sandbox: no real M-Pesa prompt is sent. Use the simulate button below." };
  },
  async startCard({ reference, callbackUrl }) {
    return { ok: true, providerRef: `sandbox_${reference}`, displayText: "Sandbox card payment.", redirectUrl: callbackUrl };
  },
  async verify() {
    return { status: "pending" };
  },
  async refund({ reference }) {
    return { ok: true, providerRef: `sandbox_refund_${reference}` };
  },
  async checkRefund() {
    return { status: "processed" };
  },
  async transfer({ reference, name }) {
    return { ok: true, providerRef: `sandbox_transfer_${reference}`, status: "success", recipientName: name.toUpperCase(), feeKes: null };
  },
  async checkTransfer() {
    return { status: "success", feeKes: null };
  },
};
