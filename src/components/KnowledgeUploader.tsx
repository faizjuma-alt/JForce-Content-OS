"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function KnowledgeUploader() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const router = useRouter();

  async function uploadOne(f: File) {
    // 1. Get signed URL from our server
    const signRes = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: f.name, mime: f.type, size: f.size }),
    });
    if (!signRes.ok) throw new Error(`sign: ${await signRes.text()}`);
    const { signedUrl, path } = await signRes.json();

    // 2. Upload directly to Supabase (bypasses Vercel's 4.5 MB limit)
    const upRes = await fetch(signedUrl, {
      method: "PUT",
      headers: { "Content-Type": f.type, "x-upsert": "false" },
      body: f,
    });
    if (!upRes.ok) throw new Error(`upload: ${upRes.status} ${await upRes.text()}`);

    // 3. Tell our server the upload completed → records in DB
    const finRes = await fetch("/api/upload", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, name: f.name, mime: f.type, size: f.size }),
    });
    if (!finRes.ok) throw new Error(`finalize: ${await finRes.text()}`);
  }

  async function handle(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    setError(null);
    try {
      const list = Array.from(files);
      for (let i = 0; i < list.length; i++) {
        setProgress(`Uploading ${i + 1} of ${list.length}: ${list[i].name}`);
        await uploadOne(list[i]);
      }
      setProgress(null);
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <label className={`btn-primary cursor-pointer ${busy ? "opacity-60 pointer-events-none" : ""}`}>
        {busy ? (progress || "Uploading…") : "+ Upload Files"}
        <input
          type="file"
          multiple
          accept="image/*,video/*,.pdf,.txt,.md,.docx"
          className="hidden"
          onChange={(e) => handle(e.target.files)}
        />
      </label>
      {error ? <span className="text-xs text-bad max-w-md">{error}</span> : null}
    </div>
  );
}