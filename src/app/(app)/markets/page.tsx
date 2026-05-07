import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { MarketUpdateSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

async function updateMarket(code: string, formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) throw new Error("not authenticated");

  const parsed = MarketUpdateSchema.safeParse({
    ytUrl:       String(formData.get("ytUrl") || ""),
    ytChannelId: String(formData.get("ytChannelId") || ""),
    active:      formData.get("active") === "on",
  });
  if (!parsed.success) throw new Error("invalid input");

  await db.market.update({
    where: { code },
    data: {
      ytUrl: parsed.data.ytUrl || null,
      ytChannelId: parsed.data.ytChannelId || null,
      active: parsed.data.active ?? true,
    },
  });

  await db.auditEvent.create({
    data: { userId: (session.user as any).id, action: "market.updated", targetId: code },
  });

  revalidatePath("/markets");
  revalidatePath("/dashboard");
}

export default async function MarketsPage() {
  const markets = await db.market.findMany({ orderBy: { code: "asc" } });

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Markets</h1>
        <p className="text-soft mt-1">
          Map each market to its YouTube channel. Used by the upload step automatically.
        </p>
      </div>

      <div className="space-y-3">
        {markets.map((m) => (
          <form key={m.code} action={updateMarket.bind(null, m.code)} className="card p-4 grid grid-cols-12 gap-3 items-center">
            <div className="col-span-1 font-mono font-bold text-orange-100">{m.code}</div>
            <div className="col-span-2">
              <div className="text-sm">{m.name}</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {m.language.split("+").map((l) => (
                  <span key={l} className={`pill ${langClass(l.trim())}`}>{l.trim().toUpperCase()}</span>
                ))}
              </div>
            </div>
            <div className="col-span-4">
              <input
                name="ytUrl"
                type="url"
                placeholder="https://youtube.com/@..."
                defaultValue={m.ytUrl || ""}
                className="input"
              />
            </div>
            <div className="col-span-3">
              <input
                name="ytChannelId"
                type="text"
                placeholder="UCxxxxxxx..."
                defaultValue={m.ytChannelId || ""}
                className="input"
              />
            </div>
            <div className="col-span-1 flex justify-center">
              <input name="active" type="checkbox" defaultChecked={m.active} className="w-4 h-4" />
            </div>
            <div className="col-span-1 text-right">
              <button className="btn-primary px-3 py-1.5 text-xs">Save</button>
            </div>
          </form>
        ))}
      </div>

      <p className="text-xs mt-4 text-soft">
        The YouTube URL is for human reference. The Channel ID (starts with <code>UC</code>) is what
        the workflow uses for OAuth-tagged uploads. Find it in YouTube Studio → Settings → Channel → Advanced.
      </p>
    </>
  );
}

function langClass(lang: string) {
  if (lang === "en") return "bg-blue-500/15 text-blue-400";
  if (lang === "fr") return "bg-purple-500/15 text-purple-300";
  return "bg-teal-500/15 text-teal-300";
}
