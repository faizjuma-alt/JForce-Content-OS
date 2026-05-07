import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SettingsSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

async function saveSettings(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) throw new Error("not authenticated");

  const parsed = SettingsSchema.safeParse({
    toolUrl:      String(formData.get("toolUrl") || ""),
    defaultCta:   String(formData.get("defaultCta") || ""),
    hashtags:     String(formData.get("hashtags") || ""),
    heygenAvatar: String(formData.get("heygenAvatar") || ""),
    voiceEn:      String(formData.get("voiceEn") || ""),
    voiceFr:      String(formData.get("voiceFr") || ""),
    voiceAr:      String(formData.get("voiceAr") || ""),
  });
  if (!parsed.success) throw new Error("invalid input");

  await db.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...parsed.data },
    update: parsed.data,
  });

  await db.auditEvent.create({
    data: { userId: (session.user as any).id, action: "settings.updated" },
  });

  revalidatePath("/settings");
}

export default async function SettingsPage() {
  const s = await db.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
        <p className="text-soft mt-1">Brand defaults + workflow integration. Secrets live in env vars.</p>
      </div>

      <form action={saveSettings} className="grid md:grid-cols-2 gap-6 max-w-5xl">
        <Card title="🎨 Brand Defaults">
          <Field label="Tool URL (replaces [LINK] in descriptions)">
            <input name="toolUrl" type="url" className="input" defaultValue={s.toolUrl} />
          </Field>
          <Field label="Default CTA">
            <input name="defaultCta" type="text" className="input" defaultValue={s.defaultCta} />
          </Field>
          <Field label="Brand Hashtags (comma-separated)">
            <input name="hashtags" type="text" className="input" defaultValue={s.hashtags} />
          </Field>
        </Card>

        <Card title="🎬 HeyGen Defaults">
          <Field label="Avatar ID">
            <input name="heygenAvatar" type="text" className="input" defaultValue={s.heygenAvatar || ""} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="EN Voice ID">
              <input name="voiceEn" className="input" defaultValue={s.voiceEn || ""} />
            </Field>
            <Field label="FR Voice ID">
              <input name="voiceFr" className="input" defaultValue={s.voiceFr || ""} />
            </Field>
            <Field label="AR Voice ID">
              <input name="voiceAr" className="input" defaultValue={s.voiceAr || ""} />
            </Field>
          </div>
        </Card>

        <Card title="🔌 Workflow Integration" full>
          <p className="text-sm text-soft mb-3">
            The webhook URL for outbound pushes lives in your environment as{" "}
            <code className="text-orange-100">CODEWORDS_WEBHOOK_URL</code>. Inbound callbacks
            arrive at <code className="text-orange-100">/api/webhook</code> and must be HMAC-signed
            with <code className="text-orange-100">WEBHOOK_HMAC_SECRET</code>.
          </p>
          <div className="text-xs space-y-1 font-mono">
            <div>Outbound:  <span className="text-orange-100">{process.env.CODEWORDS_WEBHOOK_URL ? "✓ configured" : "— not set"}</span></div>
            <div>HMAC:      <span className="text-orange-100">{process.env.WEBHOOK_HMAC_SECRET ? "✓ configured" : "— not set"}</span></div>
            <div>Blob:      <span className="text-orange-100">{process.env.BLOB_READ_WRITE_TOKEN ? "✓ configured" : "— not set"}</span></div>
            <div>Upstash:   <span className="text-orange-100">{process.env.UPSTASH_REDIS_REST_URL ? "✓ configured" : "— not set"}</span></div>
          </div>
        </Card>

        <div className="md:col-span-2 flex justify-end">
          <button className="btn-primary">Save Settings</button>
        </div>
      </form>
    </>
  );
}

function Card({ title, children, full = false }: { title: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`card p-6 ${full ? "md:col-span-2" : ""} space-y-4`}>
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider mb-1 text-soft">{label}</label>
      {children}
    </div>
  );
}
