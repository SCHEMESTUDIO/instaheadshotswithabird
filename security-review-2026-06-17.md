# InstaHeadshots — Security Review (2026-06-17)

Applied the ECC `security-review` skill (secrets, input validation, authn/z, XSS, CSRF, rate limiting, data exposure, dependencies) as a **fresh lens over the live code**, cross-checked against the prior `AUDIT.md` (2026-06-10) so this doesn't re-litigate what's already fixed.

**Scope:** `server.js`, `lib/providers/*`, upload/HEIC path, Stripe checkout + webhook + refund, admin endpoints, `/healthz`, `package.json` deps. Static-source review only — I did not exercise the live endpoints or inspect real Render/Stripe logs.

**Headline:** AUDIT.md already closed the big holes (forged webhook, stored XSS in reviews, SSRF via `/api/review`, charge-then-refuse, Gemini hang). This pass found **five things AUDIT.md did not cover**. Two were safe enough to fix now; three need your judgment because they touch a live payment app's behavior or a breaking dependency bump.

Confidence is marked per item. Facts are observed in the code; inferences are labeled.

---

## ✅ Applied now (safe, non-breaking)

### A1 — Gemini API key moved out of the URL query string → header *(was: High exposure)*
`lib/providers/gemini.js` built the request as `…:generateContent?key=${GEMINI_API_KEY}`. A secret in a URL is the classic leak path: it lands in proxy/access logs, error traces, and any URL-bearing telemetry — none of which you control once a request leaves the box. **Fixed:** the key now travels in the `x-goog-api-key` header (Google's supported auth method); the URL no longer carries it. *Confidence: High that this removes a real exposure surface; Medium on whether it was ever actually logged anywhere (depends on Render/Google's internal logging, which I can't see).*

### A2 — Stop leaking raw `err.message` to clients on 500s
`/api/start`, `/api/checkout`, and `/api/finalize` each did `res.status(500).json({ error: err.message })`. That forwards internal error text (Stripe internals, stack-adjacent messages, file paths) straight to the browser. **Fixed:** each now returns a generic message and keeps the full detail in `console.error` server-side — matching the pattern your global error handler already uses. *Confidence: High.* (The remaining `err.message` returns at L262/L501/L515 are intentional user-facing **validation** messages on 400s — e.g. "Reviews are limited to 30 words" — and are fine; L501/L515 are the only ones I'd revisit later, and only if `addReview`/`setApproved` ever throw something internal.)

Both verified with `node -c` (syntax clean).

---

## ⚠️ Recommended — needs your call (not applied)

### R1 — `app.set("trust proxy", true)` lets a client spoof its IP and bypass the per-IP daily cap *(Medium)*
`clientIp()` reads `x-forwarded-for[0]`, which is **client-controllable**. With `trust proxy: true` (trust *all* hops), a script can send `X-Forwarded-For: <random>` on each request and present a fresh IP every time, sliding under `DAILY_CAP` (20/IP). The **global** caps (`GLOBAL_DAILY_CAP`, `GLOBAL_DAILY_IMAGE_CAP`) still bound total spend, so this is abuse-throttle erosion, not an open wallet.
**Fix:** set `trust proxy` to the real hop count (Render terminates at a single proxy → `app.set("trust proxy", 1)`) and derive the client IP from `req.ip` rather than the raw header. *I did not apply this* because the correct hop count depends on Render's actual forwarding, and getting it wrong collapses every visitor onto one IP (over-throttling real users) or leaves the spoof open. Verify against a real request's `X-Forwarded-For` on Render before changing. *Confidence: High that the bypass exists; Medium on exact remediation without seeing Render's headers.*

### R2 — `/healthz` publicly broadcasts your security posture *(Medium, by-design tradeoff)*
`/healthz` returns `webhookSecretSet`, `adminEnabled`, `paymentsEnabled`, `freeCodes` count, and live sales counters with no auth. `webhookSecretSet:false` in particular tells an attacker the forge-webhook path (the one AUDIT.md fixed by falling back to a Stripe round-trip) is the weaker branch. I know this is deliberate — your `AUDIT.md` pre-launch checklist step 5 is literally `curl /healthz` to confirm these flags.
**Recommendation:** keep a minimal public `{ ok: true }`, and gate the diagnostic block behind `?key=<ADMIN_KEY>` (you already have `adminOk()`); update the checklist to `curl …/healthz?key=…`. Low effort, removes a free recon surface. *I left it alone* so I don't silently break your deploy ritual. *Confidence: High it's exposed; the impact is Low-Medium.*

### R3 — `jimp` → `file-type` moderate DoS advisory on malformed image input *(Medium)*
`npm audit` reports 4 moderate vulns: `file-type` (via `jimp`) has an infinite-loop on malformed input (GHSA-5v7r-6r5c-r473). **This app feeds user-uploaded image bytes into the image path**, so a crafted file could hang a worker. The fix is `jimp@1.6.1`, a **breaking** major bump (`npm audit fix --force`).
**Recommendation:** bump `jimp` on a branch and smoke-test the dimension/HEIC path (`lib/imagesize.js`, the HEIC convert in `/api/start`) before shipping — don't `--force` blind into prod. Interim mitigation: the existing 12 MB multer cap + 120 s Gemini abort limit blast radius, but neither stops a CPU-spin on parse. *Confidence: High the advisory applies; Medium on real-world exploitability at your scale.*

### R4 — No per-IP request-rate limiter on the pre-payment endpoints *(Low — already acknowledged)*
`AUDIT.md` notes this for `/api/start` (2×12 MB multer parse with no rate cap). Same applies to `/api/review` and `/api/card`. The daily caps + job purge bound cost, but not a burst of large uploads hammering memory/CPU before any cap trips. The ECC checklist wants an explicit limiter here.
**Recommendation:** a lightweight per-IP sliding-window limiter (e.g. 20 req/5 min) in front of `/api/start` and `/api/review`. Generous enough not to catch real users; blunts scripted abuse. *Deferred* as genuinely optional at beta volume. *Confidence: High it's absent; Low urgency.*

### R5 — Admin auth: query-string key, non-constant-time compare *(Low)*
`adminOk()` compares `req.query.key === ADMIN_KEY`. Query-string keys leak via logs/Referer (same class as A1), and `===` is not timing-safe. AUDIT.md already accepts this as "weak but acceptable for a one-person beta" — I agree at current scale; flagging for when admin moves beyond you. **If** you harden: accept the key via header and compare with `crypto.timingSafeEqual`. *Confidence: High; Low priority.*

---

## What I checked and found OK (no action)

- **Secrets:** `.env` and `.env*` are in `.gitignore` and **not git-tracked** (verified). Provider keys read from `process.env` with presence checks. No hardcoded secrets in source.
- **Stripe trust boundary:** amounts/tier are server-derived in `/api/checkout` (`TIERS[tier].cents`) — client can't underpay; tier is reconciled from Stripe metadata in webhook + finalize. Unsigned webhooks fall back to a real Stripe `sessions.retrieve` (the AUDIT.md fix) and check `payment_status==='paid'`. Solid.
- **Upload validation:** size (12 MB) + count (2) via multer, MIME regex (`jpe?g|png`), real dimension read, min-dimension floor, HEIC sniffed by magic bytes. Reasonable.
- **SSRF/anon-hosting:** `/api/review` now only persists an image whose `src` matches a server-generated result for that job (AUDIT.md fix — confirmed present).
- **No DB → no SQLi.** State is in-memory + JSON files.
- **No auth cookies** anywhere (job IDs in URL, 2 h TTL, UUIDv4) → CSRF surface is minimal; the public POSTs (`/api/review`, `/api/pro-interest`) are anonymous-by-design.

---

## Recommended order
1. **R3** (jimp bump) — only item touching untrusted-input safety directly; do it on a branch with a smoke test.
2. **R1** (trust-proxy / IP spoof) — once you can see Render's real `X-Forwarded-For`.
3. **R2** (gate `/healthz`) — 10-minute change + checklist edit.
4. **R4/R5** — when you scale past beta or share admin access.

A1 + A2 are already in the working tree (uncommitted), alongside the earlier cost-review fixes. `node -c` clean on both edited files.
