"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";

export default function KnowledgeUploader() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const router = useRouter();

  // Uploads straight to Vercel Blob (bypasses Vercel's 4.5 MB body limit).
  // /api/upload's onBeforeGenerateToken mints the client token; its
  // onUploadCompleted webhook then records the Knowledge/AuditEvent rows —
  // that webhook lands a moment after this resolves, not before.
  async function uploadOne(f: File) {
    await upload(f.name, f, {
      access: "public",
      handleUploadUrl: "/api/upload",
      clientPayload: JSON.stringify({ size: f.size }),
    });
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
      setProgress("Saving…");
      // onUploadCompleted is an async webhook — give it a beat to land
      // before refreshing, so the new file shows up on the first try.
      await new Promise((r) => setTimeout(r, 1500));
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