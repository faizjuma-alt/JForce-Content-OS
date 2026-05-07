import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ratelimit, limiters } from "@/lib/rate-limit";
import { uploadFile } from "@/lib/storage";

const MAX_BYTES = 25 * 1024 * 1024;          // 25 MB hard limit (Supabase Free supports up to 50 MB)
const ALLOWED_MIMES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml",
  "application/pdf",
  "text/plain", "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "video/mp4", "video/quicktime", "video/webm",
]);

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new NextResponse("unauthorized", { status: 401 });
  const userId = (session.user as any).id as string;

  const rl = await ratelimit(limiters.upload, `upload:${userId}`);
  if (!rl.ok) return new NextResponse("rate limited", { status: 429 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return new NextResponse("missing file", { status: 400 });

  if (file.size > MAX_BYTES) return new NextResponse("file too large (max 25 MB)", { status: 413 });
  if (!ALLOWED_MIMES.has(file.type)) {
    return new NextResponse(`unsupported mime: ${file.type}`, { status: 415 });
  }

  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "file";
  const key = `knowledge/${userId}/${Date.now()}-${safeName}`;

  let stored;
  try {
    stored = await uploadFile({ key, data: file, contentType: file.type });
  } catch (e: any) {
    return new NextResponse(`upload failed: ${e?.message || e}`, { status: 500 });
  }

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const type = isImage ? "image" : isVideo ? "video" : file.type === "application/pdf" ? "pdf" : "doc";

  const item = await db.knowledge.create({
    data: {
      ownerId: userId,
      name: file.name.slice(0, 200),
      type,
      mime: file.type,
      size: file.size,
      blobUrl: stored.url,
    },
  });

  await db.auditEvent.create({
    data: {
      userId,
      action: "knowledge.uploaded",
      targetId: item.id,
      meta: { name: item.name, size: item.size, provider: stored.provider },
    },
  });

  return NextResponse.json({ id: item.id, url: stored.url, provider: stored.provider });
}
