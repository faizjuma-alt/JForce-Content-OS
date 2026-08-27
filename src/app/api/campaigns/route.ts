import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// Force this endpoint to run per-request. Without these, Next.js tries to
// statically pre-render at build time, which hits the DB before Prisma has
// pushed the schema and fails with "table public.Campaign does not exist".
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

// Read-only listing endpoint — useful for status polling from the dashboard.
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new NextResponse("unauthorized", { status: 401 });

  try {
    const campaigns = await db.campaign.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, name: true, contentType: true, markets: true, status: true,
        updatedAt: true, publishedAt: true,
      },
    });
    return NextResponse.json({ campaigns });
  } catch (e: any) {
    // If tables aren't seeded yet, return an empty list instead of 500-ing.
    // Lets the dashboard paint even before /api/setup is run.
    console.error("[/api/campaigns] db read failed:", e?.message ?? e);
    return NextResponse.json({ campaigns: [], warning: "db not ready" });
  }
}
