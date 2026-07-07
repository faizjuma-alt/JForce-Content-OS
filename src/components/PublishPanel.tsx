"use client";

import { useState } from "react";

type LangKey = "en" | "fr" | "ar";
const LANGS: { key: LangKey; label: string }[] = [
  { key: "en", label: "English" },
  { key: "fr", label: "French" },
  { key: "ar", label: "Arabic" },
];

// Publish already-rendered videos (e.g. NotebookLM Video Overviews staged in
// Google Drive) straight to YouTube via the /publish_only endpoint. Accepts a
// Drive link/ID or any https URL per language. The API key stays server-side.
export function PublishPanel({
  campaignId,
  defaultTitle,
}: {
  campaignId: string;
  defaultTitle: string;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("unlisted");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  function normalizeVideo(v: string): string {
    const s = v.trim();
    // Accept a bare Drive file ID, a drive:// ref, or a full Drive view URL.
    const m = s.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (m) return `drive://${m[1]}`;
    if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return `drive://${s}`;
    return s;
  }

  async function publish() {
    setBusy(true);
    setError(null);
    setResult(null);
    const videos: Record<string, string> = {};
    const metadata: Record<string, { title: string; description: string }> = {};
    for (const { key } of LANGS) {
      const raw = urls[key]?.trim();
      if (!raw) continue;
      videos[key] = normalizeVideo(raw);
      metadata[key] = {
        title: (titles[key]?.trim() || defaultTitle).slice(0, 200),
        description: "",
      };
    }
    if (Object.keys(videos).length === 0) {
      setError("Add at least one video URL.");
      setBusy(false);
      return;
    }
    try {
      const r = await fetch(`/api/campaigns/${campaignId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videos, metadata, privacyStatus: privacy }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || body?.ok === false) {
        setError(body?.error || `Publish failed (HTTP ${r.status}).`);
      } else {
        setResult(body);
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="card p-5 mb-4">
      <summary className="font-bold cursor-pointer">📤 Publish external videos (NotebookLM → YouTube)</summary>
      <p className="text-xs text-soft mt-2 mb-3">
        Paste a Google Drive link, file ID, or https URL per language. Sends to
        the CodeWords <code>/publish_only</code> endpoint — no HeyGen render.
      </p>

      <div className="space-y-3">
        {LANGS.map(({ key, label }) => (
          <div key={key} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
            <label className="text-sm font-semibold">
              {label} <span className="uppercase text-xs text-soft">({key})</span>
            </label>
            <input
              className="input md:col-span-2"
              placeholder="Drive link / file ID / https URL"
              value={urls[key] || ""}
              onChange={(e) => setUrls((u) => ({ ...u, [key]: e.target.value }))}
            />
            <div className="md:col-start-2 md:col-span-2">
              <input
                className="input"
                placeholder={`Title (default: ${defaultTitle})`}
                value={titles[key] || ""}
                onChange={(e) => setTitles((t) => ({ ...t, [key]: e.target.value }))}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <label className="text-sm text-soft">Privacy</label>
        <select
          className="input max-w-[160px]"
          value={privacy}
          onChange={(e) => setPrivacy(e.target.value as any)}
        >
          <option value="unlisted">Unlisted</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
        <button className="btn-primary" onClick={publish} disabled={busy}>
          {busy ? "Publishing…" : "📤 Publish to YouTube"}
        </button>
      </div>

      {error ? (
        <div className="mt-3 text-sm text-red-400 whitespace-pre-wrap">⚠️ {error}</div>
      ) : null}

      {result?.ok ? (
        <div className="mt-3 text-sm">
          <div className="text-green-400 font-semibold mb-1">✓ Published</div>
          <div className="space-y-1">
            {Object.entries(result.ytUrls || {}).map(([market, url]) => (
              <div key={market} className="flex items-center gap-2">
                <span className="pill bg-orange/15 text-orange-100">{market}</span>
                <a
                  href={url as string}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-orange-100"
                >
                  {url as string} ↗
                </a>
              </div>
            ))}
            {Object.keys(result.ytUrls || {}).length === 0 ? (
              <div className="text-soft text-xs">
                Accepted. YouTube links will populate via webhook when upload finishes.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </details>
  );
}
