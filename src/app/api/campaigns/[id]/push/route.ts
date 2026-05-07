import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ratelimit, limiters } from "@/lib/rate-limit";
import { sign } from "@/lib/hmac";
import { languagesFor, uploadPlanFor } from "@/lib/routing";

export async function POST(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new NextResponse("unauthorized", { status: 401 });
  const userId = (session.user as any).id as string;

  const rl = await ratelimit(limiters.push, `push:${userId}`);
  if (!rl.ok) return new NextResponse("rate limited", { status: 429 });

  const id = ctx.params.id;
  const c = await db.campaign.findUnique({
    where: { id },
    include: { knowledge: { include: { knowledge: true } } },
  });
  if (!c) return new NextResponse("not found", { status: 404 });

  const markets = await db.market.findMany();
  const settings = await db.settings.findUnique({ where: { id: "singleton" } });

  const payload = {
    campaign: {
      id: c.id,
      name: c.name,
      contentType: c.contentType,
      brief: c.brief,
      keyMessage: c.keyMessage,
      audience: c.audience,
      cta: c.cta,
      ramadanMode: c.ramadanMode,
      markets: c.markets,
      languages: languagesFor(c.markets),
      uploadPlan: uploadPlanFor(c.markets),
    },
    marketsConfig: markets
      .filter((m) => c.markets.includes(m.code))
      .map((m) => ({
        code: m.code,
        name: m.name,
        language: m.language,
        ytChannelId: m.ytChannelId,
        ytUrl: m.ytUrl,
        active: m.active,
      })),
    knowledge: c.knowledge.map((ck) => ({
      id: ck.knowledge.id,
      name: ck.knowledge.name,
      type: ck.knowledge.type,
      mime: ck.knowledge.mime,
      size: ck.knowledge.size,
      url: ck.knowledge.blobUrl,
    })),
    settings: {
      toolUrl:    settings?.toolUrl,
      hashtags:   settings?.hashtags,
      heygenAvatar: settings?.heygenAvatar || process.env.HEYGEN_AVATAR_ID,
      voices: {
        en: settings?.voiceEn || process.env.HEYGEN_VOICE_EN,
        fr: settings?.voiceFr || process.env.HEYGEN_VOICE_FR,
        ar: settings?.voiceAr || process.env.HEYGEN_VOICE_AR,
      },
    },
    secrets: {
      // Forwarded server-to-server only. Never reaches the browser.
      claudeKey: process.env.CLAUDE_API_KEY || null,
      heygenKey: process.env.HEYGEN_API_KEY || null,
    },
    callback: {
      url: `${process.env.AUTH_URL || ""}/api/webhook`,
      hint: "POST scripts/videos/ytUrls to this URL with x-jforce-signature header.",
    },
    meta: {
      pushedAt: new Date().toISOString(),
      pushedBy: userId,
      source: "jforce-engine",
    },
  };

  const webhook = process.env.CODEWORDS_WEBHOOK_URL || "";
  const body = JSON.stringify(payload);
  const signature = process.env.WEBHOOK_HMAC_SECRET ? sign(body) : "";

  if (!webhook) {
    return new NextResponse(
      "CODEWORDS_WEBHOOK_URL is not configured. Set it in your environment.",
      { status: 503 },
    );
  }

  let workflowResp: { ok: boolean; status: number; text?: string };
  try {
    const r = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-jforce-signature": signature,
      },
      body,
    });
    workflowResp = { ok: r.ok, status: r.status, text: r.ok ? undefined : await r.text() };
  } catch (e: any) {
    workflowResp = { ok: false, status: 0, text: String(e?.message || e) };
  }

  if (!workflowResp.ok) {
    await db.auditEvent.create({
      data: {
        userId,
        action: "campaign.push.failed",
        targetId: id,
        meta: { status: workflowResp.status, error: workflowResp.text?.slice(0, 200) },
      },
    });
    return NextResponse.json(
      { ok: false, status: workflowResp.status, error: workflowResp.text },
      { status: 502 },
    );
  }

  await db.campaign.update({
    where: { id },
    data: { status: "GENERATING" },
  });
  await db.auditEvent.create({
    data: { userId, action: "campaign.pushed", targetId: id },
  });

  return NextResponse.json({ ok: true });
}
