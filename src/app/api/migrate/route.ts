/**
 * One-shot Supabase → Neon data migration endpoint.
 *
 * WHAT IT DOES
 *   POST/GET /api/migrate
 *     1. Opens a second Prisma client pointed at the OLD Supabase DB.
 *     2. Reads every domain table from Supabase.
 *     3. Upserts rows into Neon (the current DATABASE_URL).
 *     4. Reports before/after counts.
 *
 * SECURITY
 *   None — DELETE this file from the repo the instant you see the migration
 *   summary. The Supabase URL is embedded in this file, meaning anyone who
 *   fetches this route while it exists could theoretically trigger a re-read
 *   of your old DB (though they can't extract data, they can just re-copy it).
 *
 * WHY BOTH URLS ARE HARDCODED
 *   Vercel env vars would require another deployment cycle to become visible.
 *   Since this file is deleted right after use, hardcoding is safe and faster.
 *   Rotate the Supabase password once you've deleted the file.
 */
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { db as neon } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// URL-encoded to protect $ and @ in the password.
const SUPABASE_URL =
  "postgresql://postgres:%24Afyr%40KR2GwK5-3@db.xovelufcihglhqsfyyhi.supabase.co:5432/postgres";

const supabase = new PrismaClient({
  datasources: { db: { url: SUPABASE_URL } },
  log: ["error"],
});

async function run() {
  const summary: Record<string, any> = { source: "supabase", target: "neon" };

  // 1. Connectivity
  try {
    await supabase.$queryRaw`SELECT 1`;
    await neon.$queryRaw`SELECT 1`;
    summary.connectivity = "ok";
  } catch (e: any) {
    return NextResponse.json({ ok: false, step: "connectivity", error: e?.message }, { status: 500 });
  }

  // 2. Source inventory (row counts, so we know what's coming)
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

  // 3. Users first (everything else FKs to User.id)
  migrated.User = 0;
  errors.User = [];
  for (const u of await supabase.user.findMany()) {
    try {
      await neon.user.upsert({
        where: { email: u.email },
        create: u,
        update: {
          name: u.name ?? undefined,
          role: u.role,
          emailVerified: u.emailVerified ?? undefined,
          image: u.image ?? undefined,
        },
      });
      migrated.User++;
    } catch (e: any) {
      errors.User.push(`${u.email}: ${e?.message}`);
    }
  }

  // 4. Markets (upsert by code — the setup route already seeded 9)
  migrated.Market = 0;
  errors.Market = [];
  for (const m of await supabase.market.findMany()) {
    try {
      await neon.market.upsert({
        where: { code: m.code },
        create: m,
        update: {
          name: m.name,
          language: m.language,
          ytUrl: m.ytUrl ?? undefined,
          ytChannelId: m.ytChannelId ?? undefined,
          active: m.active,
        },
      });
      migrated.Market++;
    } catch (e: any) {
      errors.Market.push(`${m.code}: ${e?.message}`);
    }
  }

  // 5. Settings singleton
  migrated.Settings = 0;
  errors.Settings = [];
  for (const s of await supabase.settings.findMany()) {
    try {
      await neon.settings.upsert({
        where: { id: s.id },
        create: s,
        update: {
          toolUrl: s.toolUrl,
          defaultCta: s.defaultCta,
          hashtags: s.hashtags,
          claudeKeyEnc: s.claudeKeyEnc ?? undefined,
          heygenKeyEnc: s.heygenKeyEnc ?? undefined,
          heygenAvatar: s.heygenAvatar ?? undefined,
          voiceEn: s.voiceEn ?? undefined,
          voiceFr: s.voiceFr ?? undefined,
          voiceAr: s.voiceAr ?? undefined,
        },
      });
      migrated.Settings++;
    } catch (e: any) {
      errors.Settings.push(`${s.id}: ${e?.message}`);
    }
  }

  // 6. Knowledge (FKs to User)
  migrated.Knowledge = 0;
  errors.Knowledge = [];
  for (const k of await supabase.knowledge.findMany()) {
    try {
      await neon.knowledge.upsert({
        where: { id: k.id },
        create: k,
        update: k,
      });
      migrated.Knowledge++;
    } catch (e: any) {
      errors.Knowledge.push(`${k.id}: ${e?.message}`);
    }
  }

  // 7. Campaigns (FKs to User)
  migrated.Campaign = 0;
  errors.Campaign = [];
  for (const c of await supabase.campaign.findMany()) {
    try {
      await neon.campaign.upsert({
        where: { id: c.id },
        create: c,
        update: c,
      });
      migrated.Campaign++;
    } catch (e: any) {
      errors.Campaign.push(`${c.id}: ${e?.message}`);
    }
  }

  // 8. Campaign-Knowledge join
  migrated.CampaignKnowledge = 0;
  errors.CampaignKnowledge = [];
  for (const ck of await supabase.campaignKnowledge.findMany()) {
    try {
      await neon.campaignKnowledge.upsert({
        where: { campaignId_knowledgeId: { campaignId: ck.campaignId, knowledgeId: ck.knowledgeId } },
        create: ck,
        update: {},
      });
      migrated.CampaignKnowledge++;
    } catch (e: any) {
      errors.CampaignKnowledge.push(`${ck.campaignId}/${ck.knowledgeId}: ${e?.message}`);
    }
  }

  // 9. Audit log (FK to User is optional; SetNull on delete)
  migrated.AuditEvent = 0;
  errors.AuditEvent = [];
  for (const a of await supabase.auditEvent.findMany({ orderBy: { createdAt: "asc" } })) {
    try {
      await neon.auditEvent.upsert({
        where: { id: a.id },
        create: a,
        update: {},
      });
      migrated.AuditEvent++;
    } catch (e: any) {
      errors.AuditEvent.push(`${a.id}: ${e?.message}`);
    }
  }

  // 10. Post-migration counts
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
    "Reload https://j-force-content-os.vercel.app/ — your campaigns should be back.",
    "DELETE this file (src/app/api/migrate/route.ts) from the repo NOW.",
    "Rotate the Supabase DB password (Supabase → Settings → Database → Reset password).",
    "Pause or delete the Supabase project — you're off it entirely.",
  ];

  return NextResponse.json({ ok: true, ...summary });
}

export async function GET() { return run(); }
export async function POST() { return run(); }
