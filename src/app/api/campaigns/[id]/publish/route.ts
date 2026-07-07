import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ratelimit, limiters } from "@/lib/rate-limit";
import { uploadPlanFor } from "@/lib/routing";
import { PublishRequestSchema } from "@/lib/schemas";

// Publish-only: takes already-rendered videos (e.g. NotebookLM Video Overviews
// staged in Drive) and forwards them to the CodeWords /publish_only endpoint,
// which uploads to YouTube. Does NOT run the HeyGen generate/render pipeline —
// that lives in the "Push to Workflow" route.
//
// The CodeWords API key is read from CODEWORDS_API_KEY (server-only, never sent
// to the browser). The endpoint URL comes from CODEWORDS_PUBLISH_URL.
export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new NextResponse("unauthorized", { status: 401 });
  const userId = (session.user as any).id as string;

  const rl = await ratelimit(limiters.push, `publish:${userId}`);
  if (!rl.ok) return new NextResponse("rate limited", { status: 429 });

  const id = ctx.params.id;

  let json: unknown;
  try { json = await req.json(); }
  catch { return new NextResponse("invalid json", { status: 400 }); }

  const parsed = PublishRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, errors: parsed.error.issues }, { status: 422 });
  }
  const { videos, privacyStatus, metadata } = parsed.data;

  const endpoint = process.env.CODEWORDS_PUBLISH_URL || "";
  const apiKey = process.env.CODEWORDS_API_KEY || "";
  if (!endpoint) {
    return new NextResponse(
      "CODEWORDS_PUBLISH_URL is not configured. Set it in your environment.",
      { status: 503 },
    );
  }
  if (!apiKey) {
    return new NextResponse(
      "CODEWORDS_API_KEY is not configured. Set it in your environment.",
      { status: 503 },
    );
  }

  const c = await db.campaign.findUnique({ where: { id } });
  if (!c) return new NextResponse("not found", { status: 404 });

  const settings = await db.settings.findUnique({ where: { id: "singleton" } });

  // Only publish languages we actually have a video for. Derive the upload plan
  // from the campaign's markets, filtered to the provided video languages.
  const wantLangs = new Set(Object.keys(videos));
  const uploadPlan = uploadPlanFor(c.markets).filter((p) => wantLangs.has(p.lang));

  // If a provided video language matches no market in this campaign (e.g. a
  // manual KE English push on a campaign with no en-market), fall back to the
  // campaign's first market so the workflow still has a routing target.
  for (const lang of wantLangs) {
    if (!uploadPlan.some((p) => p.lang === lang)) {
      const fallbackMarket = c.markets[0] || "KE";
      uploadPlan.push({ market: fallbackMarket, lang: lang as any });
    }
  }

  const payload = {
    campaign: { id: c.id, uploadPlan },
    settings: {
      toolUrl: settings?.toolUrl,
      hashtags: settings?.hashtags,
      privacyStatus,
    },
    videos,
    metadata: metadata || {},
  };

  await db.campaign.update({ where: { id }, data: { status: "PUBLISHING" } });

  let resp: { ok: boolean; status: number; body?: any; text?: string };
  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let body: any = undefined;
    try { body = JSON.parse(text); } catch { /* non-json */ }
    resp = { ok: r.ok, status: r.status, body, text: r.ok ? undefined : text };
  } catch (e: any) {
    resp = { ok: false, status: 0, text: String(e?.message || e) };
  }

  if (!resp.ok) {
    await db.campaign.update({
      where: { id },
      data: { status: "ERROR", errorLog: resp.text?.slice(0, 500) },
    });
    await db.auditEvent.create({
      data: {
        userId,
        action: "campaign.publish.failed",
        targetId: id,
        meta: { status: resp.status, error: resp.text?.slice(0, 200) },
      },
    });
    return NextResponse.json(
      { ok: false, status: resp.status, error: resp.text },
      { status: 502 },
    );
  }

  // CodeWords returns { ytUrls: { "<MARKET>": "https://youtu.be/..." } }.
  const ytUrls = resp.body?.ytUrls || {};
  await db.campaign.update({
    where: { id },
    data: {
      status: "PUBLISHED",
      ytUrlsJson: ytUrls,
      videosJson: videos,
      publishedAt: new Date(),
    },
  });
  await db.auditEvent.create({
    data: { userId, action: "campaign.published", targetId: id, meta: { via: "publish_only" } },
  });

  return NextResponse.json({ ok: true, ytUrls });
}
