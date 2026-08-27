/**
 * One-shot Neon setup endpoint — NO AUTH.
 *
 * WHAT IT DOES  (on every hit — idempotent)
 *   1. Verifies Prisma can talk to Neon.
 *   2. Runs raw SQL to create every table in the Prisma schema, in case
 *      `prisma db push` didn't run at build time. Safe if tables exist.
 *   3. Seeds the 9 markets and the singleton Settings row.
 *   4. Promotes any ALLOWED_EMAILS entry to ADMIN.
 *
 * SECURITY
 *   None — DELETE this file from the repo as soon as you see `"ok": true`.
 *   The endpoint is idempotent and read-mostly, so a stray hit before you
 *   delete won't hurt you, but the file must not stay on main long-term.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_MARKETS = [
  { code: "NG",  name: "Nigeria",     language: "en"    },
  { code: "KE",  name: "Kenya",       language: "en"    },
  { code: "UG",  name: "Uganda",      language: "en"    },
  { code: "GH",  name: "Ghana",       language: "en"    },
  { code: "IC",  name: "Ivory Coast", language: "fr"    },
  { code: "SN",  name: "Senegal",     language: "fr"    },
  { code: "EGY", name: "Egypt",       language: "ar"    },
  { code: "MA",  name: "Morocco",     language: "ar+fr" },
  { code: "DZ",  name: "Algeria",     language: "ar+fr" },
];

// Raw DDL — matches prisma/schema.prisma. Guarded with IF NOT EXISTS so
// running this after `prisma db push` already succeeded is a no-op.
const DDL = `
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT,
  "email" TEXT UNIQUE NOT NULL,
  "emailVerified" TIMESTAMP(3),
  "image" TEXT,
  "role" TEXT NOT NULL DEFAULT 'EDITOR',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Account" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" TEXT,
  UNIQUE ("provider", "providerAccountId")
);

CREATE TABLE IF NOT EXISTS "Session" (
  "id" TEXT PRIMARY KEY,
  "sessionToken" TEXT UNIQUE NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "expires" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "VerificationToken" (
  "identifier" TEXT NOT NULL,
  "token" TEXT UNIQUE NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL,
  UNIQUE ("identifier", "token")
);

CREATE TABLE IF NOT EXISTS "Market" (
  "code" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "ytUrl" TEXT,
  "ytChannelId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Knowledge" (
  "id" TEXT PRIMARY KEY,
  "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "mime" TEXT,
  "size" INTEGER NOT NULL,
  "blobUrl" TEXT NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Knowledge_ownerId_idx" ON "Knowledge"("ownerId");

CREATE TABLE IF NOT EXISTS "Campaign" (
  "id" TEXT PRIMARY KEY,
  "creatorId" TEXT NOT NULL REFERENCES "User"("id"),
  "name" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "brief" TEXT NOT NULL,
  "keyMessage" TEXT NOT NULL,
  "audience" TEXT NOT NULL,
  "cta" TEXT NOT NULL,
  "ramadanMode" BOOLEAN NOT NULL DEFAULT FALSE,
  "markets" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "errorLog" TEXT,
  "scriptsJson" JSONB,
  "videosJson" JSONB,
  "ytUrlsJson" JSONB,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Campaign_creatorId_idx" ON "Campaign"("creatorId");
CREATE INDEX IF NOT EXISTS "Campaign_status_idx" ON "Campaign"("status");

CREATE TABLE IF NOT EXISTS "CampaignKnowledge" (
  "campaignId" TEXT NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
  "knowledgeId" TEXT NOT NULL REFERENCES "Knowledge"("id") ON DELETE CASCADE,
  PRIMARY KEY ("campaignId", "knowledgeId")
);

CREATE TABLE IF NOT EXISTS "Settings" (
  "id" TEXT PRIMARY KEY DEFAULT 'singleton',
  "toolUrl" TEXT NOT NULL DEFAULT 'https://jforce-links.codewords.run',
  "defaultCta" TEXT NOT NULL DEFAULT 'Open jforce-links.codewords.run',
  "hashtags" TEXT NOT NULL DEFAULT '#JumiaForce, #JForce, #JumiaAffiliate, #AffiliateMarketing',
  "claudeKeyEnc" TEXT,
  "heygenKeyEnc" TEXT,
  "heygenAvatar" TEXT,
  "voiceEn" TEXT,
  "voiceFr" TEXT,
  "voiceAr" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AuditEvent" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "action" TEXT NOT NULL,
  "targetId" TEXT,
  "meta" JSONB,
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AuditEvent_userId_idx" ON "AuditEvent"("userId");
CREATE INDEX IF NOT EXISTS "AuditEvent_action_idx" ON "AuditEvent"("action");
CREATE INDEX IF NOT EXISTS "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");
`;

async function runSetup() {
  const results: Record<string, unknown> = {};

  // 1. Connectivity check.
  try {
    await db.$queryRaw`SELECT 1`;
    results.db_connectivity = "ok";
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, step: "db_connectivity", error: e?.message ?? String(e) },
      { status: 500 },
    );
  }

  // 2. Create tables (idempotent).
  try {
    // Split the DDL and run each statement — some drivers reject multi-statement.
    const statements = DDL.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await db.$executeRawUnsafe(stmt);
    }
    results.tables_ensured = statements.length;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, step: "create_tables", error: e?.message ?? String(e) },
      { status: 500 },
    );
  }

  // 3. Seed the 9 markets.
  let marketsSeeded = 0;
  try {
    for (const m of DEFAULT_MARKETS) {
      await db.market.upsert({ where: { code: m.code }, create: m, update: {} });
      marketsSeeded++;
    }
    results.markets_seeded = marketsSeeded;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, step: "seed_markets", error: e?.message ?? String(e), seeded_so_far: marketsSeeded },
      { status: 500 },
    );
  }

  // 4. Seed the singleton Settings row.
  try {
    await db.settings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton" },
      update: {},
    });
    results.settings_singleton = "ok";
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, step: "seed_settings", error: e?.message ?? String(e) },
      { status: 500 },
    );
  }

  // 5. Ensure the solo user exists as ADMIN.
  const email = (process.env.SOLO_USER_EMAIL || "faiz.juma@jumia.com").toLowerCase();
  try {
    await db.user.upsert({
      where: { email },
      create: { email, name: "Faiz Jafar", role: "ADMIN", emailVerified: new Date() },
      update: { role: "ADMIN" },
    });
    results.solo_user = email;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, step: "solo_user", error: e?.message ?? String(e) },
      { status: 500 },
    );
  }

  results.next_steps = [
    "Open https://j-force-content-os.vercel.app/ — the dashboard should render.",
    "DELETE this file (src/app/api/setup/route.ts) from the repo NOW.",
    "Optionally remove SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET from Vercel env vars.",
  ];

  return NextResponse.json({ ok: true, ...results });
}

export async function GET() { return runSetup(); }
export async function POST() { return runSetup(); }
