import Image from "next/image";
import { db } from "@/lib/db";
import KnowledgeUploader from "@/components/KnowledgeUploader";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const knowledge = await db.knowledge.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { campaigns: true } } },
  });

  return (
    <>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Knowledge Base</h1>
          <p className="text-soft mt-1">
            Drop infographics, briefs, brand docs. Reference any of these from a campaign as
            context for the script generator.
          </p>
        </div>
        <KnowledgeUploader />
      </div>

      {knowledge.length === 0 ? (
        <div className="card p-16 text-center text-soft">
          No knowledge files yet. <br />
          Drop infographics or briefs here — they get attached to campaigns as context.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {knowledge.map((k) => (
            <a
              key={k.id}
              href={k.blobUrl}
              target="_blank"
              rel="noreferrer"
              className="card overflow-hidden hover:border-orange transition-colors block"
            >
              <div className="aspect-[4/3] flex items-center justify-center bg-[#0A1226] overflow-hidden">
                {k.type === "image" ? (
                  // Using <img> instead of <Image> to avoid setup overhead for arbitrary blob URLs
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={k.blobUrl} alt={k.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-5xl">📄</div>
                )}
              </div>
              <div className="p-3">
                <div className="font-semibold text-sm truncate">{k.name}</div>
                <div className="text-xs mt-1 flex items-center justify-between text-soft">
                  <span>{formatBytes(k.size)}</span>
                  {k._count.campaigns > 0 ? (
                    <span className="pill bg-orange/15 text-orange-100">
                      {k._count.campaigns} use{k._count.campaigns > 1 ? "s" : ""}
                    </span>
                  ) : null}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </>
  );
}

function formatBytes(b: number) {
  if (!b) return "0 B";
  const k = 1024;
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}
