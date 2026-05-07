"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function KnowledgeUploader() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handle(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || `Upload failed (${res.status})`);
        }
      }
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
        {busy ? "Uploading…" : "+ Upload Files"}
        <input
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.md,.docx"
          className="hidden"
          onChange={(e) => handle(e.target.files)}
        />
      </label>
      {error ? <span className="text-xs text-bad">{error}</span> : null}
    </div>
  );
}
