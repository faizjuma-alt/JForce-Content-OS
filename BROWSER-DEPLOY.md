# Browser-Only Deploy (no installs needed)

For locked-down corporate machines where you can't install Node, Git, or CLIs.

Total time: ~15 minutes. All in browser tabs.

---

## 1 · Create the three accounts (~5 min)

Open these in three tabs:

**Tab 1 — Supabase**
- [supabase.com](https://supabase.com) → New Project → name `jforce-engine`, set a strong DB password (save offline).
- After it provisions (~2 min):
  - **Project Settings → API** → copy **Project URL** + **service_role** key.
  - **Project Settings → Database → Connection string → Transaction Pooler URI** → copy. Replace `[YOUR-PASSWORD]` with the password.
  - **Storage → New bucket** → name `jforce-knowledge`, toggle Public ON.

**Tab 2 — Resend**
- [resend.com](https://resend.com) → sign up → verify a sending domain.
- API Keys → create one → copy.

**Tab 3 — GitHub** (where you already are)

---

## 2 · Create the GitHub repo (~1 min)

Back on the GitHub "Create a new repository" page:

1. **Owner**: pick yourself.
2. **Repository name**: `JForce-Content-OS` (or whatever you want — note the spelling).
3. **Description**: optional.
4. **Private**.
5. ✅ **Add a README file** (this gives the repo a default branch so you can upload to it).
6. Click **Create repository**.

---

## 3 · Upload the code (~3 min)

On your new empty repo's page (`github.com/yourname/JForce-Content-OS`):

1. Click **Add file** → **Upload files**.
2. In Windows Explorer, open the `jforce-app` folder.
3. Select **everything inside** the folder (Ctrl+A) — but NOT the folder itself.
   The `jforce-app` folder contents need to be at the root of the repo, not nested.
4. Drag the selected files into the GitHub upload zone. **Important**: drag the items themselves, not the parent folder, so the structure is preserved.
5. GitHub uploads ~45 files. Wait for the progress bar to finish.
6. At the bottom: **Commit message**: `Initial commit`. Click **Commit changes**.

GitHub may complain that some files (like `.gitignore`, `.env.example`) start with a dot. They'll still upload — you might need to confirm in a popup that says "Yes, include hidden files".

> If drag-drop misses the `prisma/`, `src/`, and `scripts/` subfolders (some browsers don't recurse), upload one folder at a time using **Add file → Upload files** repeatedly.

When you're done, your repo's file tree should look like:

```
.env.example
.gitignore
DEPLOY.md
README.md
SECURITY.md
QUICKSTART.md
BROWSER-DEPLOY.md          ← this file
seed-markets.sql           ← also at root
next.config.mjs
package.json
postcss.config.mjs
prisma/
  schema.prisma
  seed.ts
scripts/
  bootstrap.sh
  deploy.sh
src/
  app/...
  components/...
  lib/...
  middleware.ts
tailwind.config.ts
tsconfig.json
vercel.json
```

If anything's missing or in the wrong place, click **Add file → Upload files** again and add what's missing.

---

## 4 · Connect Vercel (~2 min)

Open a new tab → [vercel.com](https://vercel.com) → **Sign up** with **Continue with GitHub**. Authorize.

After sign-up:

1. Click **Add New** → **Project**.
2. **Import Git Repository** → find `JForce-Content-OS` → **Import**.
3. Framework Preset: should auto-detect **Next.js**. Don't change it.
4. **Root Directory**: leave as is (`./`).
5. **Environment Variables** — expand this section. You'll add 13 variables here. Use the table in the next step.
6. Don't click Deploy yet.

---

## 5 · Set environment variables (~3 min)

For each row in the table, click **Add another** in Vercel's env vars section, paste the **Name** and **Value**.

| Name | Value |
|---|---|
| `DATABASE_URL` | Pooler URI from Supabase (Tab 1, with password substituted) |
| `AUTH_SECRET` | A random 32-byte string — **generate at https://generate-secret.vercel.app/32** and paste |
| `AUTH_TRUST_HOST` | `true` |
| `EMAIL_SERVER_HOST` | `smtp.resend.com` |
| `EMAIL_SERVER_PORT` | `465` |
| `EMAIL_SERVER_USER` | `resend` |
| `EMAIL_SERVER_PASSWORD` | Resend API key (Tab 2) |
| `EMAIL_FROM` | `JForce Engine <noreply@yourdomain.com>` (use the domain you verified in Resend) |
| `ALLOWED_EMAILS` | `faiz.juma@jumia.com` (comma-separate to add more) |
| `SUPABASE_URL` | Project URL from Supabase (Tab 1) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key from Supabase (Tab 1) |
| `SUPABASE_BUCKET` | `jforce-knowledge` |
| `WEBHOOK_HMAC_SECRET` | Generate another random one at https://generate-secret.vercel.app/32 — **save offline** |

Then click **Deploy**.

The first build takes ~3 minutes. Vercel runs `prisma db push` against your Supabase Postgres automatically — the schema is created on first deploy.

---

## 6 · Seed the markets table (~30 sec)

After the deploy succeeds:

1. Go to your Supabase project → **SQL Editor** → **New Query**.
2. Open the `seed-markets.sql` file from your repo (in GitHub, click on it → click the "Raw" button → copy all content).
3. Paste into the SQL Editor. Click **Run**.
4. Should say "Success. No rows returned." — that means the 9 markets and Settings row were inserted.

---

## 7 · First sign-in

1. Go back to your Vercel project → click the live URL (something like `https://jforce-content-os.vercel.app`).
2. Click **Sign in** / hits `/login`.
3. Enter your email (must be the one in `ALLOWED_EMAILS`).
4. Check your inbox → click the magic link → land on the dashboard.

If the magic link doesn't arrive in 1 minute:
- Check spam.
- Check Resend's dashboard logs (resend.com → Logs).
- Most common issue: domain not verified in Resend, or `EMAIL_FROM` doesn't match the verified domain.

---

## 8 · Wire CodeWords (~5 min)

In CodeWords:
1. Open your YouTube Upload Workflow chat → click **Publish** → copy the public webhook URL.
2. Back in Vercel → your project → **Settings → Environment Variables** → add:
   - Name: `CODEWORDS_WEBHOOK_URL`, Value: the URL from step 1.
3. Vercel **Deployments** → click **Redeploy** on the latest.
4. Tell CodeWords (in chat): "When the workflow runs, verify the `x-jforce-signature` header against this HMAC secret: `<paste your WEBHOOK_HMAC_SECRET>`. Then POST callbacks to `https://your-app.vercel.app/api/webhook` with the same header."

That's it — you're live.

---

## Adding more markets to the upload routing

Edit a market on the live app: Markets tab → paste the YouTube URL and Channel ID → Save. The next campaign push includes that market in the upload plan.

## Common errors

- **Build fails: "Can't reach database server"** → DATABASE_URL is wrong. Re-copy the **Pooler** URI from Supabase, replace `[YOUR-PASSWORD]`, update env var, redeploy.
- **Build fails: "Environment variable not found: AUTH_SECRET"** → you didn't add it. Go to Settings → Environment Variables → add → redeploy.
- **Magic link arrives but "Sign-in failed"** → your email isn't in `ALLOWED_EMAILS`, or there are trailing spaces. Edit the env var, redeploy.
- **Push to Workflow returns 502** → `CODEWORDS_WEBHOOK_URL` is wrong or CodeWords isn't accepting the request. Test with curl from a different machine.
