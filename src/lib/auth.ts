/**
 * SOLO-USER STUB — replaces Auth.js entirely.
 *
 * WHY: Auth.js v5-beta.25 was crashing at config init because of an invalid
 * custom "email" provider (empty `server: {}`). Every file that imported
 * `@/lib/auth` crashed on load, producing the /login digest 627796092.
 *
 * WHAT THIS DOES: exports the same names the rest of the app imports
 * (`handlers`, `auth`, `signIn`, `signOut`) but with no real auth. Every
 * request is treated as if the SOLO_USER_EMAIL is signed in as ADMIN.
 *
 * WHEN TO REMOVE: the day someone else needs an account. At that point,
 * put the real Auth.js v5 config back with a proper provider (nodemailer
 * with a real SMTP `server` object, or the Resend provider, or a Google
 * OAuth provider). This file exists so the demo ships tomorrow.
 */
import { db } from "@/lib/db";

const SOLO_USER_EMAIL =
  (process.env.SOLO_USER_EMAIL || process.env.ALLOWED_EMAILS?.split(",")[0] || "faiz.juma@jumia.com")
    .trim()
    .toLowerCase();

const SOLO_USER_NAME = "Faiz Jafar";
const SOLO_USER_ROLE = "ADMIN" as const;

/**
 * Look up (or create) the solo user in Postgres. The rest of the app expects
 * a real user row so foreign keys (Campaign.creatorId, Knowledge.ownerId,
 * AuditEvent.userId) resolve. We upsert once per cold start and cache the id.
 */
let cachedUserId: string | null = null;
async function ensureSoloUser() {
  if (cachedUserId) return cachedUserId;
  try {
    const user = await db.user.upsert({
      where: { email: SOLO_USER_EMAIL },
      create: {
        email: SOLO_USER_EMAIL,
        name: SOLO_USER_NAME,
        role: SOLO_USER_ROLE,
        emailVerified: new Date(),
      },
      update: { role: SOLO_USER_ROLE },
    });
    cachedUserId = user.id;
    return cachedUserId;
  } catch (e) {
    console.error("[auth-stub] Failed to upsert solo user — DB unreachable?", e);
    // Fall back to a stable synthetic ID so pages that only *read* the session
    // still render. Writes that use this ID as a foreign key will still fail
    // if the DB is truly down, but at least the /dashboard route paints.
    cachedUserId = "solo-user";
    return cachedUserId;
  }
}

/**
 * The session shape the rest of the app expects, based on lib/auth callbacks.
 */
export async function auth() {
  const id = await ensureSoloUser();
  return {
    user: {
      id,
      email: SOLO_USER_EMAIL,
      name: SOLO_USER_NAME,
      role: SOLO_USER_ROLE,
    },
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * signIn / signOut are no-ops in solo mode. The login page's form action calls
 * signIn(...) — we redirect straight to /dashboard so the user never sees the
 * form even if they land on /login manually.
 */
export async function signIn(_provider?: string, _opts?: { redirectTo?: string; email?: string }) {
  const { redirect } = await import("next/navigation");
  redirect(_opts?.redirectTo || "/dashboard");
}

export async function signOut(_opts?: { redirectTo?: string }) {
  const { redirect } = await import("next/navigation");
  redirect(_opts?.redirectTo || "/dashboard");
}

/**
 * Auth.js normally exports `handlers = { GET, POST }` for the /api/auth
 * catch-all route. We ship no-op handlers so that route stops 500-ing.
 */
async function noop() {
  return new Response(JSON.stringify({ ok: true, mode: "solo-user-stub" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
export const handlers = { GET: noop, POST: noop };
