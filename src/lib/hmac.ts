import crypto from "node:crypto";

// HMAC signing for outbound and inbound webhooks. CodeWords/n8n verifies
// outbound calls with the same secret on its end; inbound callbacks must
// arrive with `x-jforce-signature` matching the body's HMAC-SHA256.

const SECRET = process.env.WEBHOOK_HMAC_SECRET || "";

export function sign(body: string): string {
  if (!SECRET) throw new Error("WEBHOOK_HMAC_SECRET is not set");
  return crypto.createHmac("sha256", SECRET).update(body).digest("hex");
}

export function verify(body: string, signature: string | null): boolean {
  if (!SECRET || !signature) return false;
  const expected = sign(body);
  // constant-time compare
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
