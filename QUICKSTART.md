# JForce Engine — Quickstart

When you get back, this is the literal sequence of commands to take you from zero to a live production app at `https://your-app.vercel.app`. ~10 minutes total.

## Once, on your laptop (~5 min)

```bash
# 1. Tools
brew install gh node                 # mac (or use nvm/winget on windows)
npm install -g vercel

# 2. Authenticate
gh auth login                        # follow the browser flow
vercel login                         # follow the browser flow
```

## Provision the three free services (~5 min in browser tabs)

Open these in three tabs and create an account on each:

1. **Supabase** → [supabase.com](https://supabase.com) → New project (name: `jforce-engine`, pick a region close to you, set a strong DB password)
   - After it provisions: **Project Settings → API** — copy:
     - **Project URL**
     - **service_role** key (the long one, NOT anon)
   - **Project Settings → Database → Connection string → Transaction Pooler URI** — copy and replace `[YOUR-PASSWORD]`
   - **Storage → New bucket** — name `jforce-knowledge`, **toggle Public ON**
2. **Resend** → [resend.com](https://resend.com) → add a sending domain → API Keys → create one
3. **(Optional) Upstash** → [upstash.com](https://upstash.com) → New Redis (Global, Free) — copy REST URL and Token

## Deploy

```bash
cd jforce-app
bash scripts/deploy.sh
```

The script asks for:
- Supabase URL, service_role key, bucket name, DATABASE_URL  ← paste from tab 1
- Resend API key + EMAIL_FROM (e.g. `JForce <noreply@yourdomain.com>`)  ← paste from tab 2
- Allowed emails (comma-separated, your work email + anyone you trust)
- CodeWords webhook URL (optional, can leave blank and add later)
- Custom domain (optional, leave blank for `*.vercel.app`)
- Repo name (default: `jforce-engine`)
- Private repo? (default: yes)

Then it does the entire deploy — schema push, seed, build, GitHub create+push, Vercel link, env vars, deploy, AUTH_URL backfill, redeploy. ~3 min.

At the end you get:
- Live URL
- GitHub URL
- Two secrets to save offline (`AUTH_SECRET`, `WEBHOOK_HMAC_SECRET`)

## First sign-in

1. Open the live URL.
2. Enter your email (must be in the allowlist you provided).
3. Click the magic link in your inbox.
4. You land on `/dashboard`. Done.

## Wire up CodeWords

In **Settings** on the live app, the integration status block confirms env vars are configured.

In CodeWords:
1. Publish your YouTube Upload Workflow → copy its public webhook URL.
2. Set it as `CODEWORDS_WEBHOOK_URL` in Vercel: `vercel env add CODEWORDS_WEBHOOK_URL production`.
3. Make CodeWords verify the inbound `x-jforce-signature` header against the `WEBHOOK_HMAC_SECRET` from the deploy output.
4. Make CodeWords POST status callbacks back to `https://your-app.vercel.app/api/webhook` with the same HMAC.

That's it — Push to Workflow now end-to-end automates from a brief in the dashboard to a video on YouTube.

## Common hiccups

- **"gh: command not found"** — install with `brew install gh` (mac) or `winget install GitHub.cli` (windows).
- **Build fails with "Can't reach database server"** — your DATABASE_URL is the direct connection, not the **Pooler URI**. Re-copy from Supabase → Database → Connection string → **Transaction Pooler**.
- **Magic link doesn't arrive** — check Resend's dashboard logs; usually a domain that isn't verified or a typo in EMAIL_FROM.
- **"Sign-in failed" after clicking the link** — your email isn't in `ALLOWED_EMAILS`, OR there are trailing spaces. Re-set with `vercel env rm ALLOWED_EMAILS production && vercel env add ALLOWED_EMAILS production`.
- **Vercel says "build command failed"** — pull the deploy logs from `vercel.com` → Deployments → click the failed one → Build Logs. Paste here and I'll fix.

## After it's live

- Add a campaign in the UI → click Push to Workflow → it POSTs to CodeWords → CodeWords callbacks fill in scripts/videos/YT URLs over time.
- Add admins via SQL: `UPDATE "User" SET role='ADMIN' WHERE email='someone@yourdomain.com';` (run in Supabase SQL Editor).
- Audit log lives in the `AuditEvent` table — every push, login, and mutation is recorded.
