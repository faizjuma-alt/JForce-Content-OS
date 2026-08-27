import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const SUPABASE_HOST_HINT = "supabase.co";
const VERCEL_BLOB_HOST_HINT = "public.blob.vercel-storage.com";

async function run() {
  const summary: Record<string, any> = { source: "supabase-storage", target: "vercel-blob" };
  const all = await db.knowledge.findMany({ select: { id: true, name: true, mime: true, blobUrl: true } });
  summary.total_knowledge_rows = all.length;

  const toMigrate = all.filter((k) => k.blobUrl?.includes(SUPABASE_HOST_HINT));
  const alreadyOnBlob = all.filter((k) => k.blobUrl?.includes(VERCEL_BLOB_HOST_HINT));
  summary.already_on_blob = alreadyOnBlob.length;
  summary.to_migrate = toMigrate.length;

  const migrated: string[] = [];
  const failed: { id: string; name: string; error: string }[] = [];

  for (const k of toMigrate) {
    try {
      const res = await fetch(k.blobUrl);
      if (!res.ok) { failed.push({ id: k.id, name: k.name, error: `Supabase fetch ${res.status}` }); continue; }
      const buf = await res.arrayBuffer();
      const contentType = res.headers.get("content-type") || k.mime || "application/octet-stream";
      const safeName = k.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "file";
      const path = `knowledge/${k.id}/${safeName}`;
      const uploaded = await put(path, Buffer.from(buf), { access: "public", contentType, addRandomSuffix: false });
      await db.knowledge.update({ where: { id: k.id }, data: { blobUrl: uploaded.url } });
      migrated.push(k.id);
    } catch (e: any) {
      failed.push({ id: k.id, name: k.name, error: e?.message ?? String(e) });
    }
  }

  summary.migrated = migrated.length;
  summary.migrated_ids = migrated;
  summary.failed = failed;
  summary.final_counts = {
    on_vercel_blob: await db.knowledge.count({ where: { blobUrl: { contains: VERCEL_BLOB_HOST_HINT } } }),
    still_on_supabase: await db.knowledge.count({ where: { blobUrl: { contains: SUPABASE_HOST_HINT } } }),
  };
  return NextResponse.json({ ok: true, ...summary });
}

export async function GET() { return run(); }
export async function POST() { return run(); }
