import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ratelimit, limiters } from "@/lib/rate-limit";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 200 * 1024 * 1024;
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

  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        // PutBlobResult (this @vercel/blob version) has no `.size` field, so
        // onUploadCompleted can't read it off `blob`. Thread the size the
        // client already knows through tokenPayload instead.
        let size = 0;
        try { size = Number(JSON.parse(clientPayload || "{}").size) || 0; } catch {}
        return {
          allowedContentTypes: Array.from(ALLOWED_MIMES),
          maximumSizeInBytes: MAX_BYTES,
          tokenPayload: JSON.stringify({ userId, size }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        try {
          const { userId: uid, size } = JSON.parse(tokenPayload || "{}");
          const mime = blob.contentType || "application/octet-stream";
          const isImage = mime.startsWith("image/");
          const isVideo = mime.startsWith("video/");
          const type = isImage ? "image" : isVideo ? "video" : mime === "application/pdf" ? "pdf" : "doc";
          await db.knowledge.create({
            data: {
              ownerId: uid,
              name: blob.pathname.split("/").pop() || "file",
              type, mime, size: size || 0, blobUrl: blob.url,
            },
          });
          await db.auditEvent.create({
            data: { userId: uid, action: "knowledge.uploaded", meta: { name: blob.pathname, size, provider: "vercel-blob" } },
          });
        } catch (e) {
          console.error("[upload] failed to record knowledge row", e);
        }
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "upload failed" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new NextResponse("unauthorized", { status: 401 });
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").slice(0, 200);
  const mime = String(body.mime || "");
  const size = Number(body.size || 0);
  const url = String(body.url || body.path || "");
  if (!name || !mime || !size || !url) return NextResponse.json({ error: "missing fields" }, { status: 400 });
  if (!ALLOWED_MIMES.has(mime)) return NextResponse.json({ error: `unsupported mime: ${mime}` }, { status: 415 });
  if (size > MAX_BYTES) return NextResponse.json({ error: "file too large" }, { status: 413 });

  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  const type = isImage ? "image" : isVideo ? "video" : mime === "application/pdf" ? "pdf" : "doc";

  const item = await db.knowledge.create({ data: { ownerId: userId, name, type, mime, size, blobUrl: url } });
  await db.auditEvent.create({ data: { userId, action: "knowledge.uploaded", targetId: item.id, meta: { name, size, provider: "vercel-blob" } } });
  return NextResponse.json({ id: item.id, url });
}
