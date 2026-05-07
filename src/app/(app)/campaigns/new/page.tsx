import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CampaignSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

async function createCampaign(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) throw new Error("not authenticated");
  const userId = (session.user as any).id as string;

  const markets = formData.getAll("markets").map(String);
  const knowledgeIds = formData.getAll("knowledgeIds").map(String);

  const parsed = CampaignSchema.safeParse({
    id: String(formData.get("id") || "").trim(),
    name: String(formData.get("name") || "").trim(),
    contentType: String(formData.get("contentType") || ""),
    brief: String(formData.get("brief") || "").trim(),
    keyMessage: String(formData.get("keyMessage") || "").trim(),
    audience: String(formData.get("audience") || "").trim(),
    cta: String(formData.get("cta") || "").trim(),
    ramadanMode: formData.get("ramadanMode") === "on",
    markets,
    knowledgeIds,
  });
  if (!parsed.success) {
    throw new Error("validation: " + parsed.error.issues.map((i) => i.message).join(", "));
  }
  const data = parsed.data;

  const exists = await db.campaign.findUnique({ where: { id: data.id } });
  if (exists) throw new Error("Campaign ID already exists");

  await db.campaign.create({
    data: {
      id: data.id,
      creatorId: userId,
      name: data.name,
      contentType: data.contentType,
      brief: data.brief,
      keyMessage: data.keyMessage,
      audience: data.audience,
      cta: data.cta,
      ramadanMode: data.ramadanMode,
      markets: data.markets,
      knowledge: {
        create: data.knowledgeIds.map((kid) => ({ knowledgeId: kid })),
      },
    },
  });

  await db.auditEvent.create({
    data: { userId, action: "campaign.created", targetId: data.id },
  });

  redirect(`/campaigns/${data.id}`);
}

export default async function NewCampaign() {
  const [knowledge, markets, settings, count] = await Promise.all([
    db.knowledge.findMany({ orderBy: { createdAt: "desc" } }),
    db.market.findMany({ orderBy: { code: "asc" } }),
    db.settings.findUnique({ where: { id: "singleton" } }),
    db.campaign.count(),
  ]);

  const suggestedId = "JFLG-" + String(count + 1).padStart(3, "0");

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight">New Campaign</h1>
        <p className="text-soft mt-1">A short brief is enough — the workflow fills in the rest.</p>
      </div>

      <form action={createCampaign} className="card p-7 space-y-5 max-w-3xl">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Campaign ID">
            <input className="input" name="id" defaultValue={suggestedId} required pattern="^[A-Z]{2,5}-\d{1,6}$" />
          </Field>
          <Field label="Campaign Name">
            <input className="input" name="name" placeholder="How to verify your Starlink account" required />
          </Field>
          <Field label="Content Type">
            <select className="select" name="contentType" defaultValue="educational">
              <option value="educational">Educational</option>
              <option value="product">Product</option>
              <option value="brand">Brand</option>
              <option value="awareness">Awareness</option>
            </select>
          </Field>
          <Field label="CTA">
            <input className="input" name="cta" defaultValue={settings?.defaultCta || ""} required />
          </Field>
          <Field label="Topic Brief" className="col-span-2">
            <textarea className="textarea" name="brief" rows={3} required minLength={10} />
          </Field>
          <Field label="Key Message" className="col-span-2">
            <input className="input" name="keyMessage" required minLength={5} />
          </Field>
          <Field label="Target Audience" className="col-span-2">
            <input className="input" name="audience" required minLength={5} />
          </Field>

          <Field label="Markets" className="col-span-2">
            <div className="flex flex-wrap gap-2">
              {markets.map((m) => (
                <label
                  key={m.code}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-line cursor-pointer hover:bg-white/5"
                >
                  <input type="checkbox" name="markets" value={m.code} className="w-4 h-4" />
                  <span className="text-sm font-medium">{m.code}</span>
                  <span className="text-xs text-soft">{m.name}</span>
                </label>
              ))}
            </div>
          </Field>

          <Field label="Knowledge Items (optional)" className="col-span-2">
            {knowledge.length === 0 ? (
              <div className="text-xs text-soft">
                No knowledge files uploaded yet. <a className="underline" href="/knowledge">Upload some →</a>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {knowledge.map((k) => (
                  <label
                    key={k.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-line cursor-pointer hover:bg-white/5"
                  >
                    <input type="checkbox" name="knowledgeIds" value={k.id} className="w-4 h-4" />
                    <span className="text-sm">{k.name}</span>
                  </label>
                ))}
              </div>
            )}
          </Field>

          <div className="col-span-2 flex items-center gap-2">
            <input type="checkbox" name="ramadanMode" id="ramadan" className="w-4 h-4" />
            <label htmlFor="ramadan" className="text-sm">
              Ramadan Mode (warmer tone, community framing, no hard sell)
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <a href="/campaigns" className="btn-ghost">Cancel</a>
          <button type="submit" className="btn-primary">Create Campaign</button>
        </div>
      </form>
    </>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs uppercase tracking-wider mb-1 text-soft">{label}</label>
      {children}
    </div>
  );
}
