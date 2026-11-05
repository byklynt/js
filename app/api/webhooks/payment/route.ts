import { handlePaymentWebhook } from "@/lib/server/deposits";

/**
 * Payment gateway callback.
 * TODO(gateway): the real gateway's signature header name and algorithm go here
 * (see verifyWebhookSignature in lib/server/deposits.ts). Until PAYMENT_WEBHOOK_SECRET is set every call is rejected.
 * Idempotent: a repeated delivery (same transactionId) is acknowledged and credits nothing.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const result = await handlePaymentWebhook(raw, request.headers.get("x-signature"), process.env.PAYMENT_WEBHOOK_SECRET);
  return Response.json(result.body, { status: result.status });
}
