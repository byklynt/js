import { handlePaymenkuWebhook } from "@/lib/server/payments/deposits-gateway";

/**
 * Paymenku payment webhook (public: no cookies, no login). Protected by the signature alone: HMAC-SHA256(timestamp + "." + raw body) with
 * PAYMENKU_WEBHOOK_SECRET, checked on the RAW text before anything is parsed. The body is limited to 64 KB. See lib/server/payments/deposits-gateway.ts.
 */
export const maxDuration = 30;

export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > 64 * 1024) return Response.json({ ok: false, message: "Payload terlalu besar." }, { status: 413 });
  const rawBody = await request.text(); // the raw text: never re-serialised
  const result = await handlePaymenkuWebhook({ rawBody, signature: request.headers.get("x-paymenku-signature"), timestamp: request.headers.get("x-paymenku-timestamp") });
  return Response.json(result.body, { status: result.status });
}
