import { ingestPaystackWebhook } from "@/lib/payments";

/**
 * Paystack webhook ingress. Point Paystack's webhook URL at https://<site>/api/webhooks/paystack.
 * The raw body is verified against x-paystack-signature before anything is trusted.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const status = await ingestPaystackWebhook(raw, request.headers.get("x-paystack-signature"));
  return new Response(null, { status });
}
