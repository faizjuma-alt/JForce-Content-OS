import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verify } from "@/lib/hmac";
import { ratelimit, limiters } from "@/lib/rate-limit";
import { WebhookCallbackSchema } from "@/lib/schemas";

// Inbound callbacks from CodeWords / n8n.
// Required header: `x-jforce-signature: <sha256-hmac-of-raw-body>`

const PHASE_TO_STATUS = {
  scripts_ready: "SCRIPTS_READY",
  videos_ready:  "VIDEOS_READY",
  published:     "PUBLISHED",
  partial:       "PARTIAL",
  error:         "ERROR",
} as const;

export async function POST(req: NextRequest) {
  // Source-IP rate limiting protects against floods even if HMAC isn't configured.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = await ratelimit(limiters.webhook, `webhook:${ip}`);
  if (!rl.ok) return new NextResponse("rate limited", { status: 429 });

  const raw = await req.text();
  const sig = req.headers.get("x-jforce-signature");

  if (!verify(raw, sig)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let body: unknown;
  try { body = JSON.parse(raw); }
  catch { return new NextResponse("invalid json", { status: 400 }); }

  const parsed = WebhookCallbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, errors: parsed.error.issues }, { status: 422 });
  }

  const { campaignId, phase, payload } = parsed.data;

  const c = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!c) return new NextResponse("campaign not found", { status: 404 });

  const update: Record<string, any> = { status: PHASE_TO_STATUS[phase] };
  if (phase === "scripts_ready" && payload?.scripts) update.scriptsJson = payload.scripts;
  if (phase === "videos_ready"  && payload?.videos)  update.videosJson  = payload.videos;
  if (phase === "published" || phase === "partial") {
    if (payload?.ytUrls) update.ytUrlsJson = payload.ytUrls;
    update.publishedAt = new Date();
  }
  if (phase === "error") update.errorLog = payload?.error || "unknown error";

  await db.campaign.update({ where: { id: campaignId }, data: update });
  await db.auditEvent.create({
    data: { action: `campaign.callback.${phase}`, targetId: campaignId, ip },
  });

  return NextResponse.json({ ok: true });
}
