# Deploying JForce Engine to Vercel

End-to-end setup, ~10 minutes total. There's a one-command path (`bash scripts/deploy.sh`) and a manual path. Both end with the same live app.

## Fastest path — one command

Pre-reqs (one-time installs, ~5 min):

```bash
# 1. GitHub CLI
brew install gh                # mac
# OR: winget install GitHub.cli # windows
gh auth login

# 2. Vercel CLI
npm i -g vercel
vercel login

# 3. Have Supabase + Resend accounts ready (see "Provision dependencies" below)
```

Then from inside `jforce-app/`:

```bash
bash scripts/deploy.sh
```

The script asks for ~10 inputs (Supabase URL, service-role key, DB string, Resend API key, allowed emails, etc.), then it:
1. Applies the Prisma schema to your Postgres
2. Seeds the 9 markets
3. Runs a local production build to catch errors before deploy
4. Creates the GitHub repo (private by default) and pushes
5. Links the Vercel project
6. Sets every env var on Vercel
7. Deploys to production
8. Sets `AUTH_URL` to the resulting URL and re-deploys

Output at the end: live URL, GitHub URL, `AUTH_SECRET` and `WEBHOOK_HMAC_SECRET` (save those offline). Total time: ~3 minutes once the inputs are ready.

---

---

## Manual path

## 1. Provision the dependencies (one time)

The recommended setup uses **Supabase as the all-in-one backend** (Postgres + Storage + future-auth). Plus Resend for email and Upstash for rate limiting.

### Supabase — free tier covers everything
1. Go to [supabase.com](https://supabase.com) → New Project named `jforce-engine`.
2. Pick a strong DB password (save it offline).
3. Wait ~2 min for the project to provision.
4. **Project Settings → API** → copy:
   - `Project URL` → this is `SUPABASE_URL`
   - `service_role` key → this is `SUPABASE_SERVICE_ROLE_KEY` (keep secret — bypasses RLS)
5. **Project Settings → Database → Connection string → Transaction Pooler URI** → copy. This is your `DATABASE_URL`. Replace `[YOUR-PASSWORD]` with the password from step 2.
6. **Storage → New bucket** → name `jforce-knowledge`, **Public** toggle ON. This is your `SUPABASE_BUCKET`.

> Why Supabase over Neon: same Postgres performance, plus you get S3-compatible Storage in the same dashboard. One vendor, one bill, one place to look when something breaks. Free tier: 500 MB DB + 1 GB storage — fine for ~1000 campaigns.

### Email provider (Resend — free up to 3,000 emails/month)
1. Go to [resend.com](https://resend.com) → sign up → add and verify a sending domain.
2. Create an API key. Note: `EMAIL_SERVER_USER` is the literal string `resend`, password is the API key.

### Upstash Redis (rate limiting — optional but recommended)
1. Go to [upstash.com](https://upstash.com) → create a Redis database (Global, Pay as you go, free tier).
2. Copy the **REST URL** and **REST Token**.

### Alternative: Neon Postgres + Vercel Blob (legacy default)
If you'd rather split DB and storage across two providers, omit `SUPABASE_*` env vars and set `BLOB_READ_WRITE_TOKEN` instead. The app's storage adapter auto-detects which one is configured.

---

## 2. Push the code to GitHub

```bash
cd jforce-app
git init
git add .
git commit -m "JForce Engine v1"
gh repo create jforce-engine --private --source=. --remote=origin --push
```

Or use the GitHub UI to create a private repo and push there.

---

## 3. Create the Vercel project

1. Go to [vercel.com/new](https://vercel.com/new) → import your `jforce-engine` repo.
2. Framework: detected as Next.js automatically.
3. Click **Deploy** — the first build will fail because env vars aren't set yet. That's fine.
4. Once the project exists, go to **Settings → Storage** and click **Create** → Blob. Vercel auto-injects `BLOB_READ_WRITE_TOKEN`.

---

## 4. Configure environment variables

In Vercel → **Settings → Environment Variables**, add for **Production** (and **Preview** if you want previews to work):

| Variable | Value |
|---|---|
| `DATABASE_URL` | from Neon (pooled connection string) |
| `AUTH_SECRET` | run `openssl rand -base64 32` and paste output |
| `AUTH_URL` | your Vercel URL, e.g. `https://jforce-engine.vercel.app` (leave blank if using `vercel.app` default) |
| `AUTH_TRUST_HOST` | `true` |
| `EMAIL_SERVER_HOST` | `smtp.resend.com` |
| `EMAIL_SERVER_PORT` | `465` |
| `EMAIL_SERVER_USER` | `resend` |
| `EMAIL_SERVER_PASSWORD` | your Resend API key |
| `EMAIL_FROM` | `JForce Engine <noreply@yourdomain.com>` |
| `ALLOWED_EMAILS` | `faiz.juma@jumia.com,colleague@jumia.com` (comma-separated allowlist) |
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key from Supabase |
| `SUPABASE_BUCKET` | `jforce-knowledge` |
| `BLOB_READ_WRITE_TOKEN` | (skip if using Supabase) injected by Vercel Blob if configured |
| `UPSTASH_REDIS_REST_URL` | from Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | from Upstash |
| `WEBHOOK_HMAC_SECRET` | run `openssl rand -hex 32` and paste output |
| `CODEWORDS_WEBHOOK_URL` | your CodeWords/n8n webhook URL |
| `CLAUDE_API_KEY` | optional — pre-fill if your workflow expects it |
| `HEYGEN_API_KEY` | optional |
| `HEYGEN_AVATAR_ID` | optional |
| `HEYGEN_VOICE_EN` | optional |
| `HEYGEN_VOICE_FR` | optional |
| `HEYGEN_VOICE_AR` | optional |

---

## 5. Provision the database

From your local machine:

```bash
# Use the production DATABASE_URL just for this step:
DATABASE_URL="<paste prod url here>" npx prisma db push
DATABASE_URL="<paste prod url here>" npx tsx prisma/seed.ts
```

Or do it from Vercel by adding a deploy hook that runs `prisma migrate deploy` and `tsx prisma/seed.ts` once.

---

## 6. Redeploy

In Vercel, hit **Deployments → Redeploy** on the latest. With env vars now set, the build succeeds and your app is live at `https://jforce-engine.vercel.app`.

---

## 7. First sign-in

1. Open the live URL → `/login`.
2. Enter your email (must be on `ALLOWED_EMAILS`).
3. Click the magic link in your inbox → you land on `/dashboard`.

---

## 8. Wire up the workflow

In **Settings**, look at the integration status block. Confirm it shows:

```
Outbound:  ✓ configured
HMAC:      ✓ configured
Blob:      ✓ configured
Upstash:   ✓ configured
```

Now configure your CodeWords or n8n workflow to:
- Accept POST at `CODEWORDS_WEBHOOK_URL` with body shape per [README's "Workflow contract"](./README.md#workflow-contract).
- Verify the `x-jforce-signature` header (HMAC-SHA256 of raw body, key = `WEBHOOK_HMAC_SECRET`).
- POST back to `https://your-app.vercel.app/api/webhook` with phase callbacks, signed the same way.

Test by creating a campaign and clicking **Push to Workflow**.

---

## 9. Custom domain (optional)

Add your domain in Vercel → Settings → Domains. Vercel handles SSL automatically. After DNS propagates, update `AUTH_URL` to the new domain and redeploy.

---

## Operational notes

- **Backups**: Neon takes hourly snapshots on the free tier. Verify in their dashboard.
- **Logs**: Vercel → Deployments → click the deployment → Runtime Logs.
- **Audit trail**: every mutation is logged in `AuditEvent`. Query in Prisma Studio: `npm run db:studio`.
- **Adding an admin**: insert directly into the DB — `UPDATE "User" SET role='ADMIN' WHERE email='...';`. The `Role` enum supports `ADMIN`, `EDITOR` (default), `VIEWER`.

## Common pitfalls

- **"Sign-in failed"** even though you used the right email → the email isn't in `ALLOWED_EMAILS`, or the env var has trailing spaces. Re-check.
- **Magic link doesn't arrive** → confirm the sending domain is verified in Resend; check spam; check Resend dashboard logs for delivery status.
- **Webhook callbacks return 401** → the workflow isn't signing the body correctly. Both sides must use the same `WEBHOOK_HMAC_SECRET` and HMAC the **raw** body bytes, not the parsed JSON.
- **Files won't upload** → confirm `BLOB_READ_WRITE_TOKEN` is set, and check your Vercel Blob storage hasn't hit its size cap.
