# JForce Engine — Faceless Reels Platform

A production Next.js 14 app that drives multilingual faceless-reel generation and YouTube uploads across 9 African markets. Sits in front of CodeWords or n8n, exposes a clean dashboard for non-technical operators, and ships with security baked in.

```
┌─────────────┐    1. brief        ┌────────────────────┐
│   Operator  │ ────────────────▶  │  JForce Engine     │
│  (browser)  │                    │  (this Next.js app)│
└─────────────┘ ◀──── 5. status ── └────────┬───────────┘
                                           │ 2. POST /api/campaigns/:id/push
                                           │    (HMAC-signed)
                                           ▼
                          ┌─────────────────────────────────┐
                          │  CodeWords / n8n workflow       │
                          │  Claude → HeyGen → S3 → YouTube │
                          └─────────────────────────────────┘
                                           │ 3. progress callbacks
                                           │    POST /api/webhook (HMAC)
                                           ▼
                          ┌─────────────────────────────────┐
                          │  Postgres   ←  status updates   │
                          │  Vercel Blob ← knowledge files  │
                          └─────────────────────────────────┘
                                           │ 4. UI re-render
```

## Stack

- **Next.js 14 App Router** + **TypeScript**
- **NextAuth.js v5** with magic-link email (passwordless)
- **Prisma + Postgres** (Neon, Supabase, or Vercel Postgres)
- **Vercel Blob** for knowledge file uploads
- **Upstash Redis** for rate limiting (optional but recommended)
- **Tailwind CSS** for styling
- **Zod** for input validation
- HMAC-signed webhooks both directions

## What it does

- **Dashboard** — campaign counts, recent activity, market connection status.
- **Campaigns** — create from a brief, view scripts/videos/YT URLs, push to workflow.
- **Markets** — configure each of NG, KE, UG, GH, IC, SN, EGY, MA, DZ with its YouTube channel ID.
- **Knowledge** — upload infographics, briefs, and brand docs that get attached to campaigns as context.
- **Settings** — brand defaults, HeyGen avatar/voice IDs, environment status.

## Quick start

For deployment, start with [`QUICKSTART.md`](./QUICKSTART.md) — one-command deploy in ~10 minutes.

For local development:

```bash
git clone <this repo>
cd jforce-app
cp .env.example .env
# Fill in DATABASE_URL, AUTH_SECRET, EMAIL_*, ALLOWED_EMAILS, SUPABASE_*

bash scripts/bootstrap.sh        # installs, generates, db-pushes, seeds
npm run dev
```

Open `http://localhost:3000` → enter your email → click the magic link in the email → you're in.

## Deploy to Vercel

```bash
bash scripts/deploy.sh
```

The script does the full deployment: GitHub repo + Vercel project + env vars + DB schema + seed + production build. Manual path also documented in [`DEPLOY.md`](./DEPLOY.md) if you'd rather do it step by step.

## Security model

See [`SECURITY.md`](./SECURITY.md) for the threat model and what each layer protects against. Highlights:

- Magic-link auth, no passwords ever
- Hard email allowlist — only addresses in `ALLOWED_EMAILS` can sign in
- Per-user rate limiting (Upstash) on auth, uploads, and pushes
- Inbound webhook HMAC verification with constant-time compare
- Strict CSP / HSTS / X-Frame-Options DENY
- Audit log for every mutation
- Server-only secrets — API keys never reach the browser

## What's where

```
src/
├─ app/
│  ├─ (app)/                authenticated shell
│  │  ├─ dashboard/         overview
│  │  ├─ campaigns/         list + new + detail
│  │  ├─ markets/           9-market config
│  │  ├─ knowledge/         file uploads
│  │  └─ settings/          brand + integration status
│  ├─ api/
│  │  ├─ auth/[...nextauth]/    NextAuth handlers
│  │  ├─ campaigns/[id]/push/   outbound webhook → workflow
│  │  ├─ knowledge/[id]/        delete
│  │  ├─ upload/                file uploads → Vercel Blob
│  │  └─ webhook/               inbound callbacks (HMAC-verified)
│  ├─ login/                magic-link sign-in
│  └─ layout.tsx
├─ components/             Nav, StatusPill, KnowledgeUploader
├─ lib/
│  ├─ auth.ts              NextAuth setup + allowlist
│  ├─ db.ts                Prisma singleton
│  ├─ hmac.ts              webhook signing
│  ├─ rate-limit.ts        Upstash rate limiters
│  ├─ routing.ts           market → language routing table
│  └─ schemas.ts           Zod validation
├─ middleware.ts           edge auth gate + security headers
prisma/
├─ schema.prisma           User, Campaign, Market, Knowledge, AuditEvent
└─ seed.ts
```

## Workflow contract

When you click **Push to Workflow** on a campaign, we POST to `CODEWORDS_WEBHOOK_URL` with this shape:

```jsonc
{
  "campaign": {
    "id": "JFLG-002",
    "name": "...",
    "contentType": "educational",
    "markets": ["NG","KE","MA"],
    "languages": ["en","ar","fr"],
    "uploadPlan": [{"market":"NG","lang":"en"}, {"market":"MA","lang":"ar"}, ...]
  },
  "marketsConfig": [/* { code, ytChannelId, ... } per market */],
  "knowledge":     [/* { id, name, url } per attached file */],
  "settings":      { /* heygenAvatar, voices, hashtags, toolUrl */ },
  "secrets":       { "claudeKey": "...", "heygenKey": "..." },
  "callback":      { "url": "https://your-app.vercel.app/api/webhook" },
  "meta":          { "pushedAt": "...", "pushedBy": "..." }
}
```

Header: `x-jforce-signature: <sha256-hmac of body, key=WEBHOOK_HMAC_SECRET>`.

When the workflow reaches a milestone, it should POST back to `/api/webhook`:

```jsonc
{ "campaignId": "JFLG-002", "phase": "scripts_ready",
  "payload": { "scripts": { "en": {...}, "fr": {...}, "ar": {...} } } }
```

Phases: `scripts_ready` → `videos_ready` → `published` (or `partial` / `error`).

## Local development tips

- `npm run db:studio` — Prisma Studio for inspecting data
- `npm run db:migrate` — apply schema migrations to the prod DB
- Use `ngrok http 3000` while testing webhook callbacks against your local server
