#!/usr/bin/env bash
# JForce Engine — one-command deploy script.
#
# Pre-reqs (one time, ~10 min):
#   1. Install gh CLI:    https://cli.github.com  (then `gh auth login`)
#   2. Install vercel CLI: `npm i -g vercel`       (then `vercel login`)
#   3. Create a Supabase project at https://supabase.com (free tier).
#      Note these values — the script will ask for them:
#       - SUPABASE_URL                 (Project Settings → API → Project URL)
#       - SUPABASE_SERVICE_ROLE_KEY    (Project Settings → API → service_role key)
#       - DATABASE_URL                 (Project Settings → Database → Connection string → Transaction Pooler URI)
#   4. Create the storage bucket in Supabase → Storage → New bucket → name "jforce-knowledge", public.
#   5. Have an SMTP provider's creds ready (Resend recommended — resend.com).
#
# Run from inside jforce-app/:
#   bash scripts/deploy.sh

set -euo pipefail

cd "$(dirname "$0")/.."

echo "═══════════════════════════════════════════════════════════"
echo "  JForce Engine — deploy"
echo "═══════════════════════════════════════════════════════════"
echo

# ─── 0. Sanity checks ──────────────────────────────────────────
command -v gh     >/dev/null || { echo "✗ gh CLI not installed. https://cli.github.com"; exit 1; }
command -v vercel >/dev/null || { echo "✗ vercel CLI not installed. npm i -g vercel"; exit 1; }
command -v node   >/dev/null || { echo "✗ node not installed."; exit 1; }
command -v openssl >/dev/null || { echo "✗ openssl not installed."; exit 1; }

gh auth status >/dev/null 2>&1     || { echo "✗ gh not logged in. Run: gh auth login"; exit 1; }
vercel whoami  >/dev/null 2>&1     || { echo "✗ vercel not logged in. Run: vercel login"; exit 1; }

# ─── 1. Collect env values from operator ───────────────────────
read -p "Supabase Project URL (https://xxx.supabase.co): " SUPABASE_URL
read -p "Supabase service_role key:                       " SUPABASE_SERVICE_ROLE_KEY
read -p "Supabase storage bucket name [jforce-knowledge]: " SUPABASE_BUCKET
SUPABASE_BUCKET=${SUPABASE_BUCKET:-jforce-knowledge}
read -p "Postgres DATABASE_URL (Supabase pooler):         " DATABASE_URL
echo
read -p "Resend API key (for magic-link emails):           " EMAIL_PASS
read -p "EMAIL_FROM (e.g. JForce Engine <noreply@x.com>): " EMAIL_FROM
read -p "Allowlisted emails (comma-sep):                   " ALLOWED_EMAILS
echo
read -p "CodeWords webhook URL (or blank for now):         " CW_WEBHOOK
read -p "Custom domain or leave blank for vercel.app:      " AUTH_URL_INPUT
read -p "GitHub repo name [jforce-engine]:                 " REPO_NAME
REPO_NAME=${REPO_NAME:-jforce-engine}
read -p "Make repo private? [Y/n]:                         " IS_PRIV
IS_PRIV=${IS_PRIV:-Y}

AUTH_SECRET=$(openssl rand -base64 32)
WEBHOOK_HMAC_SECRET=$(openssl rand -hex 32)

# ─── 2. Apply DB schema + seed ─────────────────────────────────
echo
echo "▶ Installing deps and applying schema to Supabase Postgres…"
npm install --no-audit --no-fund

DATABASE_URL="$DATABASE_URL" npx prisma generate
DATABASE_URL="$DATABASE_URL" npx prisma db push --accept-data-loss
DATABASE_URL="$DATABASE_URL" npx tsx prisma/seed.ts

echo "✓ schema + seed applied"

# ─── 3. Local build sanity ─────────────────────────────────────
echo
echo "▶ Running local production build…"
npm run build
echo "✓ build clean"

# ─── 4. Push to GitHub ─────────────────────────────────────────
echo
echo "▶ Initializing git + pushing to GitHub…"

if [ ! -d .git ]; then
  git init -b main
  git add .
  git commit -m "JForce Engine — initial deploy" >/dev/null
fi

if ! gh repo view "$REPO_NAME" >/dev/null 2>&1; then
  PRIV_FLAG="--public"
  if [[ "$IS_PRIV" =~ ^[Yy] ]]; then PRIV_FLAG="--private"; fi
  gh repo create "$REPO_NAME" $PRIV_FLAG --source=. --remote=origin --push
else
  git remote get-url origin >/dev/null 2>&1 || gh repo sync "$(gh api user --jq .login)/$REPO_NAME"
  git push -u origin main 2>/dev/null || git push origin main
fi
echo "✓ pushed to GitHub"

# ─── 5. Link Vercel project ────────────────────────────────────
echo
echo "▶ Linking Vercel project…"

if [ ! -d .vercel ]; then
  vercel link --yes --project "$REPO_NAME" || vercel link --yes
fi

# ─── 6. Push env vars to Vercel ────────────────────────────────
echo
echo "▶ Setting Vercel environment variables (production)…"

push_env () {
  local NAME="$1" VAL="$2"
  if [ -n "$VAL" ]; then
    printf '%s' "$VAL" | vercel env add "$NAME" production --force >/dev/null 2>&1 || \
    printf '%s' "$VAL" | vercel env add "$NAME" production
  fi
}

push_env DATABASE_URL                "$DATABASE_URL"
push_env AUTH_SECRET                 "$AUTH_SECRET"
push_env AUTH_TRUST_HOST             "true"
push_env EMAIL_SERVER_HOST           "smtp.resend.com"
push_env EMAIL_SERVER_PORT           "465"
push_env EMAIL_SERVER_USER           "resend"
push_env EMAIL_SERVER_PASSWORD       "$EMAIL_PASS"
push_env EMAIL_FROM                  "$EMAIL_FROM"
push_env ALLOWED_EMAILS              "$ALLOWED_EMAILS"
push_env SUPABASE_URL                "$SUPABASE_URL"
push_env SUPABASE_SERVICE_ROLE_KEY   "$SUPABASE_SERVICE_ROLE_KEY"
push_env SUPABASE_BUCKET             "$SUPABASE_BUCKET"
push_env WEBHOOK_HMAC_SECRET         "$WEBHOOK_HMAC_SECRET"
push_env CODEWORDS_WEBHOOK_URL       "$CW_WEBHOOK"
[ -n "$AUTH_URL_INPUT" ] && push_env AUTH_URL "$AUTH_URL_INPUT"

echo "✓ env vars set"

# ─── 7. Deploy ─────────────────────────────────────────────────
echo
echo "▶ Deploying to production…"
DEPLOY_URL=$(vercel deploy --prod --yes | tee /tmp/jforce-deploy.log | tail -1)
echo "✓ deployed: $DEPLOY_URL"

# ─── 8. If AUTH_URL wasn't preset, set it from deploy URL ──────
if [ -z "$AUTH_URL_INPUT" ] && [ -n "$DEPLOY_URL" ]; then
  printf '%s' "$DEPLOY_URL" | vercel env add AUTH_URL production --force >/dev/null 2>&1 || \
  printf '%s' "$DEPLOY_URL" | vercel env add AUTH_URL production
  echo "▶ Re-deploying with AUTH_URL set…"
  vercel deploy --prod --yes
fi

echo
echo "═══════════════════════════════════════════════════════════"
echo "  ✓ DONE"
echo
echo "  Live URL:   $DEPLOY_URL"
echo "  GitHub:     https://github.com/$(gh api user --jq .login)/$REPO_NAME"
echo "  AUTH_SECRET (saved to Vercel env, also keep offline):"
echo "              $AUTH_SECRET"
echo "  WEBHOOK_HMAC_SECRET (share with CodeWords):"
echo "              $WEBHOOK_HMAC_SECRET"
echo
echo "  Next steps:"
echo "    1. Visit the live URL → /login → enter your email → click magic link."
echo "    2. Configure CodeWords to verify x-jforce-signature using"
echo "       the HMAC secret above."
echo "    3. Configure CodeWords to POST callbacks to:"
echo "       $DEPLOY_URL/api/webhook"
echo "═══════════════════════════════════════════════════════════"
