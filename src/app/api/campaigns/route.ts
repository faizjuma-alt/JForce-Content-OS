import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// Read-only listing endpoint — useful for status polling from the dashboard.
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new NextResponse("unauthorized", { status: 401 });

  const campaigns = await db.campaign.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, name: true, contentType: true, markets: true, status: true,
      updatedAt: true, publishedAt: true,
    },
  });
  return NextResponse.json({ campaigns });
}
