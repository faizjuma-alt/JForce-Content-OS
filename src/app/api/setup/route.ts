/**
 * One-shot setup endpoint for migrating from Supabase to Neon.
 *
 * WHAT IT DOES
 *   POST/GET /api/setup?token=<SETUP_TOKEN>
 *     1. Verifies Prisma can talk to the current DATABASE_URL (Neon).
 *     2. Seeds the 9 markets and the singleton Settings row.
 *     3. Optionally promotes the first ALLOWED_EMAILS entry to ADMIN.
 *
 * SCHEMA CREATION
 *   Handled at Vercel build time by the modified `build` script in
 *   package.json (`prisma db push` before `next build`), NOT here.
 *
 * SECURITY
 *   Gated by the SETUP_TOKEN env var. Set a random string in Vercel,
 *   pass it as ?token=... when calling. DELETE THIS FILE after use.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

async function runSetup(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const expected = process.env.SETUP_TOKEN;

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "SETUP_TOKEN not configured on server. Set it in Vercel env vars." },
      { status: 500 },
    );
  }
  if (!token || token !== expected) {
    return NextResponse.json({ ok: false, error: "Invalid or missing token." }, { status: 401 });
  }

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

  // 2. Seed the 9 markets.
  let marketsSeeded = 0;
  for (const m of DEFAULT_MARKETS) {
    await db.market.upsert({ where: { code: m.code }, create: m, update: {} });
    marketsSeeded++;
  }
  results.markets_seeded = marketsSeeded;

  // 3. Seed the singleton Settings row.
  await db.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });
  results.settings_singleton = "ok";

  // 4. Promote the first allowlisted email to ADMIN, if that user exists.
  const allowed = (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length) {
    const promoted = await db.user.updateMany({
      where: { email: { in: allowed } },
      data: { role: "ADMIN" },
    });
    results.admins_promoted = promoted.count;
  }

  results.next_steps = [
    "Reload https://j-force-content-os.vercel.app/login and sign in.",
    "DELETE this file (src/app/api/setup/route.ts) from the repo.",
    "Optionally remove SETUP_TOKEN from Vercel env vars.",
    "Optionally remove SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET.",
  ];

  return NextResponse.json({ ok: true, ...results });
}

export async function GET(req: NextRequest) {
  return runSetup(req);
}

export async function POST(req: NextRequest) {
  return runSetup(req);
}
