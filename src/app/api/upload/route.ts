import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ratelimit, limiters } from "@/lib/rate-limit";
import { createClient } from "@supabase/supabase-js";

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB hard cap
const ALLOWED_MIMES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml",
  "application/pdf",
  "text/plain", "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "video/mp4", "video/quicktime", "video/webm",
]);

function sb() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// POST = request a signed upload URL. Body: { name, mime, size }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new NextResponse("unauthorized", { status: 401 });
  const userId = (session.user as any).id as string;

  const rl = await ratelimit(limiters.upload, `upload:${userId}`);
  if (!rl.ok) return new NextResponse("rate limited", { status: 429 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").slice(0, 200);
  const mime = String(body.mime || "");
  const size = Number(body.size || 0);

  if (!name) return NextResponse.json({ error: "missing name" }, { status: 400 });
  if (!ALLOWED_MIMES.has(mime)) return NextResponse.json({ error: `unsupported mime: ${mime}` }, { status: 415 });
  if (size > MAX_BYTES) return NextResponse.json({ error: "file too large (max 200 MB)" }, { status: 413 });
  if (size <= 0)        return NextResponse.json({ error: "empty file" }, { status: 400 });

  const safeName = name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "file";
  const path = `knowledge/${userId}/${Date.now()}-${safeName}`;
  const bucket = process.env.SUPABASE_BUCKET!;

  const { data, error } = await sb().storage.from(bucket).createSignedUploadUrl(path);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl, token: data.token, path, bucket });
}

// PATCH = finalize: record the upload in DB after the client uploads directly
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new NextResponse("unauthorized", { status: 401 });
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({}));
  const path = String(body.path || "");
  const name = String(body.name || "").slice(0, 200);
  const mime = String(body.mime || "");
  const size = Number(body.size || 0);

  if (!path || !name || !mime || !size) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const bucket = process.env.SUPABASE_BUCKET!;
  const { data: { publicUrl } } = sb().storage.from(bucket).getPublicUrl(path);

  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  const type = isImage ? "image" : isVideo ? "video" : mime === "application/pdf" ? "pdf" : "doc";

  const item = await db.knowledge.create({
    data: { ownerId: userId, name, type, mime, size, blobUrl: publicUrl },
  });

  await db.auditEvent.create({
    data: { userId, action: "knowledge.uploaded", targetId: item.id, meta: { name, size, provider: "supabase" } },
  });

  return NextResponse.json({ id: item.id, url: publicUrl });
}