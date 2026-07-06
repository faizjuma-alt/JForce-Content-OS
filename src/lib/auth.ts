import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import type { EmailConfig } from "next-auth/providers";

const ALLOWED = (process.env.ALLOWED_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const ResendEmailProvider: EmailConfig = {
  id: "nodemailer",
  type: "email",
  name: "Email (Resend)",
  from: process.env.EMAIL_FROM || "noreply@resend.dev",
  maxAge: 10 * 60,
  server: {},
  options: {},
  async sendVerificationRequest({ identifier, url, provider }) {
    const apiKey = process.env.EMAIL_SERVER_PASSWORD || process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("Resend API key missing (EMAIL_SERVER_PASSWORD)");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: provider.from,
        to: identifier,
        subject: "Sign in to JForce Engine",
        html: `<div style="font-family:-apple-system,sans-serif;max-width:540px;margin:0 auto;padding:32px 20px;color:#0F172A;"><div style="background:linear-gradient(135deg,#ED7100 0%,#FF8C29 100%);border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;"><div style="color:white;font-weight:800;font-size:24px;letter-spacing:-0.5px;">JUMIA <span style="opacity:0.85;">FORCE</span></div><div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:4px;">Faceless Reels Engine</div></div><h1 style="font-size:20px;margin-top:0;">Your sign-in link</h1><p style="line-height:1.55;color:#334155;">Click the button below to sign in. This link expires in 10 minutes and can be used only once.</p><p style="margin:28px 0;"><a href="${url}" style="display:inline-block;background:#0A2342;color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;">Sign in to JForce</a></p><p style="color:#64748B;font-size:12px;line-height:1.55;">If the button doesn't work, copy this URL into your browser:<br/><a href="${url}" style="color:#ED7100;word-break:break-all;">${url}</a></p></div>`,
        text: `Sign in to JForce Engine: ${url}\n\nThis link expires in 10 minutes.`,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend API ${res.status}: ${body}`);
    }
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    verifyRequest: "/login?check-email=1",
    error: "/login?error=1",
  },
  trustHost: true,
  secret: process.env.AUTH_SECRET,

  providers: [ResendEmailProvider as any],

  callbacks: {
    async signIn({ user }) {
      const email = (user.email || "").toLowerCase();
      if (!ALLOWED.length) {
        console.error("[auth] ALLOWED_EMAILS env var is empty — every sign-in will be rejected");
        return false;
      }
      const ok = ALLOWED.includes(email);
      if (!ok) console.warn(`[auth] sign-in rejected for ${email} (not in allowlist)`);
      return ok;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role || "EDITOR";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },

  events: {
    async signIn({ user }) {
      try {
        await db.auditEvent.create({
          data: { userId: user.id, action: "auth.login" },
        });
      } catch (e) {
        console.error("[audit] failed to record auth.login", e);
      }
    },
  },
});
