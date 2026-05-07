# Security Model

What this document covers: the threat model the app was designed against, the controls in place, and the operational hygiene needed to keep them effective.

## Threat model

The app stores **brand-controlled marketing assets**, **API keys** (Claude, HeyGen) and exposes **YouTube publishing automation** for the @yankeesolutions channel and (eventually) 9 production channels. The realistic attackers we care about:

| Actor | What they want | Mitigation |
|---|---|---|
| Random internet drive-by | Squat on the URL, scrape content, look for credentials in client bundle | Auth gate; no credentials in client bundle; security headers; CSP |
| Phishing / credential reuse | Sign in to the dashboard as an operator | Magic-link auth (no passwords to phish); hard email allowlist |
| Compromised operator inbox | Click magic link sent to the wrong place | 10-minute token expiry; one-time-use tokens; audit log shows the IP |
| Insider with old access | Continue acting after they should have been removed | Allowlist is the source of truth — remove email and they can never sign in again |
| Workflow side compromise | Send fake "published" callbacks to manipulate dashboard state | HMAC-signed webhooks; constant-time signature compare |
| Brute force / abuse | Spam logins, uploads, pushes | Per-user / per-IP rate limiting via Upstash sliding window |
| Supply chain | Malicious npm package in the dependency tree | `npm audit`; minimal dep set (12 prod deps); lockfile pinning |

What we explicitly do **not** mitigate against here:
- A compromised Vercel account itself (mitigation: enable Vercel SSO + 2FA on the org).
- A compromised Postgres provider (mitigation: enable IP allowlists in Neon if you're paranoid; rotate `DATABASE_URL` periodically).

---

## Layers of defense

### 1. Authentication

- **NextAuth v5 with Email provider**, Prisma session adapter.
- **Magic link only** — no passwords stored anywhere, ever. Eliminates the password-reuse class of attack entirely.
- Tokens expire in 10 minutes and are one-time-use (NextAuth's default behavior).
- **Hard email allowlist** in `ALLOWED_EMAILS`. The `signIn` callback returns `false` for any email not in the list, regardless of magic-link validity. Removing someone's access is one env-var change away.

### 2. Authorization

- **Role-based access** (`ADMIN`, `EDITOR`, `VIEWER`) on the `User` table. Today only knowledge deletion is role-gated; expand to per-action checks as needed.
- All mutating server actions and API routes call `auth()` and reject unauthenticated requests.
- Prisma queries always scope by current user where ownership matters (knowledge files).

### 3. Transport

- **HSTS preload-eligible header**: `max-age=63072000; includeSubDomains; preload`.
- All cookies set `Secure; HttpOnly; SameSite=lax` by default in NextAuth.
- Vercel terminates TLS with auto-rotated certs.

### 4. Browser-side

- **Strict CSP**:
  - `default-src 'self'`
  - `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com` (the `unsafe-*` are required for Next.js' inline RSC payloads; tighten further with nonces if you need PCI-grade)
  - `frame-ancestors 'none'` blocks clickjacking.
  - `form-action 'self'` blocks form-action-redirect attacks.
- **`X-Frame-Options: DENY`** redundancy with `frame-ancestors 'none'`.
- **`X-Content-Type-Options: nosniff`** prevents MIME-type confusion.
- **`Referrer-Policy: strict-origin-when-cross-origin`** prevents URL leakage to third parties.
- **`Permissions-Policy`** disables camera/mic/geolocation by default.

### 5. Webhooks

- **Outbound**: every payload to the workflow is signed with `WEBHOOK_HMAC_SECRET` (HMAC-SHA256 over the raw body, hex-encoded, sent as `x-jforce-signature`). The workflow side verifies before acting.
- **Inbound**: `/api/webhook` rejects any request without a valid `x-jforce-signature`. Comparison uses `crypto.timingSafeEqual` to defeat timing attacks.
- The route also rate-limits by source IP (100 req/min) so a compromised secret doesn't allow infinite floods.

### 6. Rate limiting

Upstash Redis (sliding window). Limits:

| Resource | Window | Limit | Key |
|---|---|---|---|
| Login attempts | 60s | 5 | IP |
| Generic API | 60s | 60 | session |
| Workflow pushes | 60s | 10 | user |
| File uploads | 60s | 20 | user |
| Webhook callbacks | 60s | 100 | source IP |

If Upstash isn't configured, all limiters degrade to no-ops — this is intentional for local dev, but **must be configured in production**.

### 7. Input validation

Every mutation validates with **Zod schemas** in `src/lib/schemas.ts`:
- Campaign IDs match `^[A-Z]{2,5}-\d{1,6}$`.
- Markets restricted to the 9-element enum.
- File uploads check size (≤10 MB) + MIME type allowlist (no executables, no `application/octet-stream`).
- Filename sanitised before being used as a Blob key (`[^A-Za-z0-9._-]` → `_`, max 120 chars).

### 8. Audit log

Every mutation creates an `AuditEvent` row with:
- Actor user ID
- Action (`campaign.created`, `campaign.pushed`, `auth.login`, etc.)
- Target ID
- Source IP, user agent
- Timestamp

The table has no UPDATE/DELETE permissions in the application — it's append-only by convention. For tamper-proof audit, run a daily SQL dump to immutable cold storage.

### 9. Secrets handling

- API keys (Claude, HeyGen) live in **environment variables only**. They never touch the client bundle.
- The `secrets` block in workflow payloads is server-injected at push time, not stored client-side.
- The optional encrypted columns on `Settings` (`claudeKeyEnc`, `heygenKeyEnc`) are intentionally unused by default — env vars are simpler. If you need DB-stored keys, enable Postgres `pgcrypto` and use `pgp_sym_encrypt`.

### 10. Dependencies

Twelve production packages, all from major maintainers. Run `npm audit` before each deploy. The `package.json` pins minor versions to avoid surprise updates; renew quarterly.

---

## Operational checklist

- [ ] Rotate `AUTH_SECRET` annually.
- [ ] Rotate `WEBHOOK_HMAC_SECRET` whenever a workflow operator changes.
- [ ] Rotate `DATABASE_URL` if Neon credentials are exposed.
- [ ] Review `ALLOWED_EMAILS` quarterly — remove people who left.
- [ ] Enable Vercel team SSO + 2FA. The blast radius of a Vercel-account compromise is everything; protect it accordingly.
- [ ] Set up [Vercel Web Analytics](https://vercel.com/docs/analytics) only if you're OK with Vercel seeing referrer URLs.
- [ ] Subscribe to Vercel security mailing list for platform-level CVEs.

---

## What's intentionally NOT in scope (yet)

- **MFA on top of magic-link**. If you need FIDO2/WebAuthn, swap the email provider for `next-auth/providers/passkey`.
- **End-to-end encryption** of brand assets at rest beyond what Postgres + Vercel Blob already provide. They use AES-256-GCM at rest already.
- **CAPTCHA** on the login form. Magic-link auth makes brute-force pointless; rate limiting handles spam. Add Turnstile if you start seeing abuse.
- **DDoS mitigation** beyond what Vercel's edge already does. If your traffic profile justifies more, add Cloudflare in front.

---

## Reporting a vulnerability

Email security@yourdomain.com — replace before publishing. We'll acknowledge within 72 hours.
