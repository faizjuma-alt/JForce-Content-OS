import Link from "next/link";
import { db } from "@/lib/db";
import { StatusPill } from "@/components/StatusPill";

export const dynamic = "force-dynamic";

export default async function CampaignsList() {
  const campaigns = await db.campaign.findMany({ orderBy: { updatedAt: "desc" } });

  return (
    <>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Campaigns</h1>
          <p className="text-soft mt-1">Briefs in. Scripts, videos, and uploads out.</p>
        </div>
        <Link href="/campaigns/new" className="btn-primary">+ New Campaign</Link>
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-12 px-5 py-3 text-xs uppercase tracking-wider text-soft border-b border-line">
          <div className="col-span-3">Campaign</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-3">Markets</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {campaigns.length === 0 ? (
          <div className="py-16 text-center text-soft">
            No campaigns yet. Click <strong>+ New Campaign</strong>.
          </div>
        ) : (
          campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}`}
              className="grid grid-cols-12 px-5 py-4 border-b border-line items-center hover:bg-white/5"
            >
              <div className="col-span-3">
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-soft">{c.id}</div>
              </div>
              <div className="col-span-2 text-sm capitalize text-soft">{c.contentType}</div>
              <div className="col-span-3 flex flex-wrap gap-1">
                {(c.markets || []).map((m) => (
                  <span key={m} className="pill bg-orange/15 text-orange-100">{m}</span>
                ))}
              </div>
              <div className="col-span-2">
                <StatusPill status={c.status} />
              </div>
              <div className="col-span-2 text-right text-xs text-soft">
                Open →
              </div>
            </Link>
          ))
        )}
      </div>
    </>
  );
}
