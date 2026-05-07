import Link from "next/link";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const FLIGHT = ["GENERATING", "SCRIPTS_READY", "RENDERING", "VIDEOS_READY", "PUBLISHING"];

export default async function Dashboard() {
  const [total, published, flight, recent, markets] = await Promise.all([
    db.campaign.count(),
    db.campaign.count({ where: { status: { in: ["PUBLISHED", "PARTIAL"] } } }),
    db.campaign.count({ where: { status: { in: FLIGHT as any } } }),
    db.campaign.findMany({ orderBy: { updatedAt: "desc" }, take: 6 }),
    db.market.findMany({ orderBy: { code: "asc" } }),
  ]);

  const uploads = recent.reduce((acc, c) => {
    const yt = (c.ytUrlsJson as Record<string, string>) || {};
    return acc + Object.values(yt).filter(Boolean).length;
  }, 0);

  return (
    <>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Mission Control</h1>
          <p className="text-soft mt-1">9 markets · 3 languages · 1 pipeline.</p>
        </div>
        <Link href="/campaigns/new" className="btn-primary">+ New Campaign</Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Tile label="Total Campaigns"  value={total} />
        <Tile label="Published"        value={published} color="text-good" />
        <Tile label="In Flight"        value={flight}    color="text-warn" />
        <Tile label="YouTube Uploads"  value={uploads}   color="text-orange-100" />
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Recent Activity</h2>
            <Link href="/campaigns" className="btn-ghost text-xs">View all →</Link>
          </div>
          {recent.length === 0 ? (
            <div className="py-12 text-center text-soft">
              No campaigns yet — click <strong>+ New Campaign</strong> to start.
            </div>
          ) : (
            <div className="space-y-2">
              {recent.map((c) => (
                <Link
                  key={c.id}
                  href={`/campaigns/${c.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg navy-grad flex items-center justify-center text-xs font-bold">
                      {c.id.slice(0, 3)}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{c.name}</div>
                      <div className="text-xs text-soft">
                        {c.id} · {(c.markets || []).length} markets
                      </div>
                    </div>
                  </div>
                  <StatusPill status={c.status} />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Markets Pulse</h2>
            <Link href="/markets" className="btn-ghost text-xs">Configure →</Link>
          </div>
          <div className="space-y-2">
            {markets.map((m) => {
              const ok = !!(m.ytUrl || m.ytChannelId);
              return (
                <div key={m.code} className="flex items-center justify-between text-sm py-1">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-soft">{m.code}</span>
                    {m.name}
                  </span>
                  <span className={`pill ${ok ? "bg-good/15 text-good" : "bg-soft/15 text-[#A8B3C5]"}`}>
                    {ok ? "Connected" : "Pending"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function Tile({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wider text-soft">{label}</div>
      <div className={`text-3xl font-extrabold mt-2 ${color || ""}`}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    PENDING:       ["bg-soft/15 text-[#A8B3C5]", "Pending"],
    GENERATING:    ["bg-warn/15 text-warn",      "Generating"],
    SCRIPTS_READY: ["bg-orange/15 text-orange-100", "Scripts Ready"],
    RENDERING:     ["bg-warn/15 text-warn",      "Rendering"],
    VIDEOS_READY:  ["bg-orange/15 text-orange-100", "Videos Ready"],
    PUBLISHING:    ["bg-warn/15 text-warn",      "Publishing"],
    PUBLISHED:     ["bg-good/15 text-good",      "Published"],
    PARTIAL:       ["bg-orange/15 text-orange-100", "Partial"],
    ERROR:         ["bg-bad/15 text-bad",        "Error"],
  };
  const [cls, label] = map[status] || ["bg-soft/15 text-[#A8B3C5]", status];
  return <span className={`pill ${cls}`}>{label}</span>;
}
