import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { StatusPill } from "@/components/StatusPill";
import { PublishPanel } from "@/components/PublishPanel";
import { languagesFor } from "@/lib/routing";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

async function pushAction(id: string) {
  "use server";
  const session = await auth();
  if (!session?.user) throw new Error("not authenticated");
  const h = headers();
  const proto = h.get("x-forwarded-proto") || "https";
  const host = h.get("host");
  await fetch(`${proto}://${host}/api/campaigns/${id}/push`, {
    method: "POST",
    headers: { cookie: h.get("cookie") || "" },
  });
  redirect(`/campaigns/${id}`);
}

async function deleteAction(id: string) {
  "use server";
  const session = await auth();
  if (!session?.user) throw new Error("not authenticated");
  await db.campaign.delete({ where: { id } });
  await db.auditEvent.create({
    data: { userId: (session.user as any).id, action: "campaign.deleted", targetId: id },
  });
  redirect("/campaigns");
}

export default async function CampaignDetail({ params }: { params: { id: string } }) {
  const c = await db.campaign.findUnique({
    where: { id: params.id },
    include: { knowledge: { include: { knowledge: true } } },
  });
  if (!c) notFound();

  const langs = languagesFor(c.markets);
  const scripts = (c.scriptsJson as Record<string, any>) || {};
  const videos = (c.videosJson as Record<string, string>) || {};
  const ytUrls = (c.ytUrlsJson as Record<string, string>) || {};
  const markets = await db.market.findMany();
  const marketMap = Object.fromEntries(markets.map((m) => [m.code, m]));

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-xs text-soft uppercase tracking-wider">{c.id}</div>
          <h1 className="text-3xl font-extrabold tracking-tight">{c.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/campaigns" className="btn-ghost">← Back</Link>
          <form action={pushAction.bind(null, c.id)}>
            <button className="btn-primary">⚡ Push to Workflow</button>
          </form>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <StatusPill status={c.status} />
        {c.markets.map((m) => (
          <span key={m} className="pill bg-orange/15 text-orange-100">{m}</span>
        ))}
        {langs.map((l) => (
          <span key={l} className={`pill ${langClass(l)}`}>{l.toUpperCase()}</span>
        ))}
        {c.ramadanMode ? <span className="pill bg-purple-500/15 text-purple-300">Ramadan</span> : null}
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Field label="Content Type" value={c.contentType} />
        <Field label="CTA" value={c.cta} />
        <Field label="Brief" value={c.brief} className="md:col-span-2" />
        <Field label="Key Message" value={c.keyMessage} className="md:col-span-2" />
        <Field label="Target Audience" value={c.audience} className="md:col-span-2" />
      </div>

      {c.knowledge.length > 0 ? (
        <details className="card p-5 mb-4" open>
          <summary className="font-bold cursor-pointer">📎 Knowledge Items ({c.knowledge.length})</summary>
          <div className="flex flex-wrap gap-2 mt-3">
            {c.knowledge.map((ck) => (
              <span key={ck.knowledgeId} className="pill bg-orange/15 text-orange-100">
                {ck.knowledge.name}
              </span>
            ))}
          </div>
        </details>
      ) : null}

      {Object.keys(scripts).length > 0 ? (
        <details className="card p-5 mb-4">
          <summary className="font-bold cursor-pointer">📝 Generated Scripts</summary>
          <div className="mt-3 space-y-3 text-sm">
            {Object.entries(scripts).map(([lang, s]: [string, any]) => (
              <div key={lang}>
                <div className="font-semibold mb-1 flex items-center gap-2">
                  <span className={`pill ${langClass(lang as any)}`}>{lang.toUpperCase()}</span>
                  {s?.title}
                </div>
                <pre className="whitespace-pre-wrap text-xs p-3 rounded-lg bg-[#0A1226] text-[#B8C5D6]">
                  {s?.script}
                </pre>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {Object.keys(videos).length > 0 ? (
        <details className="card p-5 mb-4" open>
          <summary className="font-bold cursor-pointer">🎬 Rendered Videos</summary>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {Object.entries(videos).map(([lang, url]) => (
              <a
                key={lang}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="card p-3 text-sm hover:border-orange transition-colors bg-[#0A1226]"
              >
                <span className={`pill ${langClass(lang as any)}`}>{lang.toUpperCase()}</span>
                <div className="text-xs mt-2 truncate text-soft">{url}</div>
              </a>
            ))}
          </div>
        </details>
      ) : null}

      <PublishPanel campaignId={c.id} defaultTitle={c.name} />

      {Object.values(ytUrls).filter(Boolean).length > 0 ? (
        <details className="card p-5 mb-4" open>
          <summary className="font-bold cursor-pointer">📺 YouTube Uploads</summary>
          <div className="mt-3 space-y-1">
            {Object.entries(ytUrls)
              .filter(([_, u]) => u)
              .map(([market, url]) => (
                <div key={market} className="flex items-center justify-between text-sm py-2 border-b border-line">
                  <span>
                    <span className="pill bg-orange/15 text-orange-100">{market}</span>{" "}
                    {marketMap[market]?.name || ""}
                  </span>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-orange-100"
                  >
                    {url} ↗
                  </a>
                </div>
              ))}
          </div>
        </details>
      ) : null}

      <div className="flex justify-end mt-6">
        <form action={deleteAction.bind(null, c.id)}>
          <button className="btn-danger" type="submit">Delete Campaign</button>
        </form>
      </div>
    </>
  );
}

function Field({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs uppercase tracking-wider mb-1 text-soft">{label}</div>
      <div className="text-sm text-[#C5D0E0] capitalize-first whitespace-pre-wrap">{value}</div>
    </div>
  );
}

function langClass(lang: "en" | "fr" | "ar") {
  if (lang === "en") return "bg-blue-500/15 text-blue-400";
  if (lang === "fr") return "bg-purple-500/15 text-purple-300";
  return "bg-teal-500/15 text-teal-300";
}
