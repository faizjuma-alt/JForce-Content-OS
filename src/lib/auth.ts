import NextAuth from "next-auth";
import EmailProvider from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";

const ALLOWED = (process.env.ALLOWED_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },
  pages: { signIn: "/login", verifyRequest: "/login?check-email=1" },
  trustHost: true,

  providers: [
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT || 465),
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
      maxAge: 10 * 60, // 10 minutes
    }),
  ],

  callbacks: {
    async signIn({ user }) {
      const email = (user.email || "").toLowerCase();
      // Hard allowlist — block everything else.
      if (!ALLOWED.length) return false;
      return ALLOWED.includes(email);
    },
    async session({ session, user }) {
      // Surface role + id on the session for client/server consumers.
      if (session.user) {
        (session.user as any).id = user.id;
        (session.user as any).role = (user as any).role || "EDITOR";
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
      } catch {
        // ignore audit failures so they don't break login
      }
    },
  },
});
