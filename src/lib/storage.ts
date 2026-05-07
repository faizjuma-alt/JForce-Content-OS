// Unified storage adapter — picks Supabase if SUPABASE_* env vars are set,
// otherwise falls back to Vercel Blob. Both produce a public HTTPS URL that
// CodeWords' "Direct URL" upload mode can consume.

import { put as vercelPut, del as vercelDel } from "@vercel/blob";

const HAS_SUPABASE =
  !!process.env.SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !!process.env.SUPABASE_BUCKET;

async function supabaseClient() {
  // Lazy require so the package is only loaded when actually used.
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function uploadFile(opts: {
  key: string;          // path inside the bucket / blob key
  data: ArrayBuffer | Blob | Buffer | File;
  contentType: string;
}): Promise<{ url: string; provider: "supabase" | "vercel-blob" }> {
  if (HAS_SUPABASE) {
    const sb = await supabaseClient();
    const bucket = process.env.SUPABASE_BUCKET!;
    const file = opts.data instanceof File ? opts.data : new Blob([opts.data as any], { type: opts.contentType });
    const { error } = await sb.storage.from(bucket).upload(opts.key, file, {
      contentType: opts.contentType,
      cacheControl: "3600",
      upsert: false,
    });
    if (error) throw new Error(`supabase upload: ${error.message}`);
    const { data: { publicUrl } } = sb.storage.from(bucket).getPublicUrl(opts.key);
    return { url: publicUrl, provider: "supabase" };
  }

  const blob = await vercelPut(opts.key, opts.data as any, {
    access: "public",
    addRandomSuffix: true,
    contentType: opts.contentType,
  });
  return { url: blob.url, provider: "vercel-blob" };
}

export async function deleteFile(url: string): Promise<void> {
  if (HAS_SUPABASE && url.includes("/storage/v1/object/public/")) {
    const sb = await supabaseClient();
    const bucket = process.env.SUPABASE_BUCKET!;
    // URL format: https://<proj>.supabase.co/storage/v1/object/public/<bucket>/<key>
    const key = url.split(`/${bucket}/`)[1];
    if (!key) return;
    await sb.storage.from(bucket).remove([key]);
    return;
  }
  try { await vercelDel(url); } catch { /* best-effort */ }
}
