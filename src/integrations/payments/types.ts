/** Payment provider adapter (PRD §9.1). Amounts are whole KES; adapters convert to provider units. */

export type StartResult =
  | { ok: true; providerRef: string | null; displayText: string; redirectUrl?: string }
  | { ok: false; reason: string };

export type Verification =
  | { status: "success"; providerRef: string; amountKes: number; feeKes: number; currency: string }
  | { status: "pending" }
  | { status: "failed"; reason: string };

export type RefundStart = { ok: true; providerRef: string } | { ok: false; reason: string };

export type RefundCheck = { status: "processed" } | { status: "pending" } | { status: "failed"; reason: string };

export interface PaymentProvider {
  name: "paystack" | "sandbox";
  startMpesa(input: { reference: string; amountKes: number; phone: string; email: string }): Promise<StartResult>;
  startCard(input: { reference: string; amountKes: number; email: string; callbackUrl: string }): Promise<StartResult>;
  verify(reference: string): Promise<Verification>;
  /** Refund part or all of a transaction, by our platform reference. */
  refund(input: { reference: string; amountKes: number; note: string }): Promise<RefundStart>;
  checkRefund(providerRef: string): Promise<RefundCheck>;
}
