#!/usr/bin/env bash
# One-shot bootstrap for a fresh checkout.
# Usage:  bash scripts/bootstrap.sh
# Requires: node >=18, an internet connection, a populated .env file.

set -euo pipefail

if [ ! -f .env ]; then
  echo "Missing .env — copying from .env.example. Fill it in and re-run."
  cp .env.example .env
  exit 1
fi

echo "1/4  installing deps …"
npm install --no-audit --no-fund

echo "2/4  generating prisma client …"
npx prisma generate

echo "3/4  pushing schema to database …"
npx prisma db push

echo "4/4  seeding markets + settings …"
npx tsx prisma/seed.ts

echo
echo "✓ ready. start the dev server with:  npm run dev"
