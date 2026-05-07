import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteFile } from "@/lib/storage";

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new NextResponse("unauthorized", { status: 401 });
  const userId = (session.user as any).id as string;

  const k = await db.knowledge.findUnique({ where: { id: ctx.params.id } });
  if (!k) return new NextResponse("not found", { status: 404 });

  const role = (session.user as any).role;
  if (k.ownerId !== userId && role !== "ADMIN") {
    return new NextResponse("forbidden", { status: 403 });
  }

  await deleteFile(k.blobUrl);
  await db.knowledge.delete({ where: { id: k.id } });
  await db.auditEvent.create({
    data: { userId, action: "knowledge.deleted", targetId: k.id },
  });

  return new NextResponse(null, { status: 204 });
}
