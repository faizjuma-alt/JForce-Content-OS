/**
 * One-shot Supabase → Neon data migration endpoint.
 *
 * Opens a second Prisma client pointed at Supabase, reads every domain
 * table, upserts rows into Neon (the current DATABASE_URL), reports
 * before/after counts.
 *
 * DELETE this file the instant the migration reports ok:true.
 * The Supabase URL/password is embedded — rotate the password after.
 */
import { NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@prisma/client";
import { db as neon } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const SUPABASE_URL =
  "postgresql://postgres:%24Afyr%40KR2GwK5-3@db.xovelufcihglhqsfyyhi.supabase.co:5432/postgres";

const supabase = new PrismaClient({
  datasources: { db: { url: SUPABASE_URL } },
  log: ["error"],
});

// Prisma needs `Prisma.DbNull` (not JS null) for nullable JSON fields on writes.
const j = (v: any) => (v === null || v === undefined ? Prisma.DbNull : v);

async function run() {
  const summary: Record<string, any> = { source: "supabase", target: "neon" };

  try {
    await supabase.$queryRaw`SELECT 1`;
    await neon.$queryRaw`SELECT 1`;
    summary.connectivity = "ok";
  } catch (e: any) {
    return NextResponse.json({ ok: false, step: "connectivity", error: e?.message }, { status: 500 });
  }

  const srcCounts: Record<string, number> = {};
  try {
    srcCounts.User = await supabase.user.count();
    srcCounts.Market = await supabase.market.count();
    srcCounts.Settings = await supabase.settings.count();
    srcCounts.Knowledge = await supabase.knowledge.count();
    srcCounts.Campaign = await supabase.campaign.count();
    srcCounts.CampaignKnowledge = await supabase.campaignKnowledge.count();
    srcCounts.AuditEvent = await supabase.auditEvent.count();
    summary.source_counts = srcCounts;
  } catch (e: any) {
    return NextResponse.json({ ok: false, step: "source_inventory", error: e?.message }, { status: 500 });
  }

  const migrated: Record<string, number> = {};
  const errors: Record<string, string[]> = {};

  // Users
  migrated.User = 0; errors.User = [];
  for (const u of await supabase.user.findMany()) {
    try {
      await neon.user.upsert({
        where: { email: u.email },
        create: {
          id: u.id, email: u.email, name: u.name, image: u.image,
          role: u.role, emailVerified: u.emailVerified, createdAt: u.createdAt,
        },
        update: {
          name: u.name ?? undefined,
          role: u.role,
          emailVerified: u.emailVerified ?? undefined,
          image: u.image ?? undefined,
        },
      });
      migrated.User++;
    } catch (e: any) { errors.User.push(`${u.email}: ${e?.message}`); }
  }

  // Markets
  migrated.Market = 0; errors.Market = [];
  for (const m of await supabase.market.findMany()) {
    try {
      await neon.market.upsert({
        where: { code: m.code },
        create: m,
        update: {
          name: m.name, language: m.language,
          ytUrl: m.ytUrl ?? undefined, ytChannelId: m.ytChannelId ?? undefined,
          active: m.active,
        },
      });
      migrated.Market++;
    } catch (e: any) { errors.Market.push(`${m.code}: ${e?.message}`); }
  }

  // Settings
  migrated.Settings = 0; errors.Settings = [];
  for (const s of await supabase.settings.findMany()) {
    try {
      await neon.settings.upsert({
        where: { id: s.id },
        create: s,
        update: {
          toolUrl: s.toolUrl, defaultCta: s.defaultCta, hashtags: s.hashtags,
          claudeKeyEnc: s.claudeKeyEnc ?? undefined,
          heygenKeyEnc: s.heygenKeyEnc ?? undefined,
          heygenAvatar: s.heygenAvatar ?? undefined,
          voiceEn: s.voiceEn ?? undefined, voiceFr: s.voiceFr ?? undefined, voiceAr: s.voiceAr ?? undefined,
        },
      });
      migrated.Settings++;
    } catch (e: any) { errors.Settings.push(`${s.id}: ${e?.message}`); }
  }

  // Knowledge
  migrated.Knowledge = 0; errors.Knowledge = [];
  for (const k of await supabase.knowledge.findMany()) {
    try {
      await neon.knowledge.upsert({
        where: { id: k.id },
        create: k,
        update: {
          name: k.name, type: k.type, mime: k.mime ?? undefined,
          size: k.size, blobUrl: k.blobUrl, tags: k.tags,
        },
      });
      migrated.Knowledge++;
    } catch (e: any) { errors.Knowledge.push(`${k.id}: ${e?.message}`); }
  }

  // Campaigns — needs JSON null normalization
  migrated.Campaign = 0; errors.Campaign = [];
  for (const c of await supabase.campaign.findMany()) {
    try {
      const data: any = {
        id: c.id, creatorId: c.creatorId, name: c.name,
        contentType: c.contentType, brief: c.brief, keyMessage: c.keyMessage,
        audience: c.audience, cta: c.cta, ramadanMode: c.ramadanMode,
        markets: c.markets, status: c.status,
        errorLog: c.errorLog ?? undefined,
        scriptsJson: j(c.scriptsJson),
        videosJson: j(c.videosJson),
        ytUrlsJson: j(c.ytUrlsJson),
        publishedAt: c.publishedAt ?? undefined,
        createdAt: c.createdAt, updatedAt: c.updatedAt,
      };
      await neon.campaign.upsert({
        where: { id: c.id },
        create: data,
        update: data,
      });
      migrated.Campaign++;
    } catch (e: any) { errors.Campaign.push(`${c.id}: ${e?.message}`); }
  }

  // CampaignKnowledge
  migrated.CampaignKnowledge = 0; errors.CampaignKnowledge = [];
  for (const ck of await supabase.campaignKnowledge.findMany()) {
    try {
      await neon.campaignKnowledge.upsert({
        where: { campaignId_knowledgeId: { campaignId: ck.campaignId, knowledgeId: ck.knowledgeId } },
        create: ck,
        update: {},
      });
      migrated.CampaignKnowledge++;
    } catch (e: any) { errors.CampaignKnowledge.push(`${ck.campaignId}/${ck.knowledgeId}: ${e?.message}`); }
  }

  // AuditEvent — meta is JSON, may be null
  migrated.AuditEvent = 0; errors.AuditEvent = [];
  for (const a of await supabase.auditEvent.findMany({ orderBy: { createdAt: "asc" } })) {
    try {
      const data: any = {
        id: a.id, userId: a.userId ?? undefined, action: a.action,
        targetId: a.targetId ?? undefined,
        meta: j(a.meta),
        ip: a.ip ?? undefined, userAgent: a.userAgent ?? undefined,
        createdAt: a.createdAt,
      };
      await neon.auditEvent.upsert({
        where: { id: a.id },
        create: data,
        update: {},
      });
      migrated.AuditEvent++;
    } catch (e: any) { errors.AuditEvent.push(`${a.id}: ${e?.message}`); }
  }

  const dstCounts: Record<string, number> = {
    User: await neon.user.count(),
    Market: await neon.market.count(),
    Settings: await neon.settings.count(),
    Knowledge: await neon.knowledge.count(),
    Campaign: await neon.campaign.count(),
    CampaignKnowledge: await neon.campaignKnowledge.count(),
    AuditEvent: await neon.auditEvent.count(),
  };

  summary.migrated = migrated;
  summary.errors = Object.fromEntries(
    Object.entries(errors).filter(([, arr]) => arr.length > 0),
  );
  summary.target_counts = dstCounts;

  await supabase.$disconnect();

  summary.next_steps = [
    "Reload https://j-force-content-os.vercel.app/ — campaigns/knowledge/audit history should be back.",
    "DELETE this file (src/app/api/migrate/route.ts) from the repo NOW.",
    "Rotate the Supabase DB password (Supabase → Settings → Database → Reset password).",
    "Pause the Supabase project — Neon is your source of truth now.",
  ];

  return NextResponse.json({ ok: true, ...summary });
}

export async function GET() { return run(); }
export async function POST() { return run(); }
