# Pre-beta audit — 2026-06-10

Scope: everything (share/social, payments, abuse, failure paths, mobile, legal). Audience: LinkedIn + Reddit launch.
Each item is marked **FIXED** (in this commit) or **ACTION** (needs you) / **LATER** (deliberate punt).

---

## 1. Share / social layer (your known gap)

- **FIXED — No Open Graph tags at all.** A pasted link on LinkedIn/Reddit/Slack/iMessage showed bare text. Added full `og:*` + `twitter:card` tags, canonical URL, theme-color to `index.html`.
- **FIXED — No share image.** Built `public/og.png` (1200×630, ~280 KB) from frames of your two demo videos: headline "Five headshots. One bird. $1." + two polaroid-style stills (woman + macaw, man + owl). Referenced as an absolute URL, which LinkedIn requires.
- **FIXED — No touch icon.** `apple-touch-icon.png` (macaw head crop) — this is what shows when someone shares to iMessage/saves to home screen. The SVG-emoji favicon renders as blank on some crawlers.
- **FIXED — No robots.txt / sitemap.xml.** Added (API paths disallowed).
- **ACTION — after you deploy:** run the URL through LinkedIn's Post Inspector (linkedin.com/post-inspector) once. LinkedIn caches previews ~7 days; inspecting forces a refresh so your first real share uses the new card. Reddit picks up og:image automatically on new posts.
- **LATER — per-result share pages.** The Bird ID card is shared as an image file (good for LinkedIn posts), but there's no `https://…/share/<id>` link with its own OG preview ("I got the Magnificent Frigatebird"). That's the strongest viral mechanic you're missing. Needs persisted result images, so it's a post-beta project, not a tweak.

## 2. Payment edge cases

- **FIXED — Forged-webhook free generation.** With `STRIPE_WEBHOOK_SECRET` unset, `POST /api/stripe/webhook` trusted any JSON — anyone who'd called `/api/start` could mark their own job paid (your API cost, $0 revenue, scriptable). Unsigned events are now verified against the Stripe API before being trusted.
- **FIXED — Typo'd beta code silently charged $1.** An invalid code fell through to Stripe checkout. Your beta testers WILL typo codes. Now returns a clear 400.
- **FIXED — Charged, then refused.** The daily IP cap was checked at finalize — *after* payment — so request #21 paid $1 and got "Daily limit reached." Cap is now enforced at `/api/start`, before any money moves; the counter increments when generation actually starts (covers the webhook path too, which previously bypassed the cap entirely).
- **FIXED — Paid into a purged job.** Jobs were deleted 30 min after creation, but Stripe checkout sessions live 24 h by default — pay at minute 35 and you'd be charged for a job that no longer existed. Checkout sessions now expire at 31 min, unpaid jobs purge at 45 min, paid jobs live 2 h, and a job mid-generation is never purged.
- **FIXED — "Your $1 will be refunded" was a promise with no mechanism.** Total generation failure now auto-refunds via Stripe (logged; only fires when all 5 looks fail and a real payment exists). Front-end copy updated to match.
- **ACTION — partial failures have no policy.** If 2 of 5 looks fail, the user paid $1 for 3 headshots and the UI shows "skipped" tiles. At NB2's ~1/20 failure rate this will be rare but nonzero across a beta wave. Decide: ignore, manual refund on complaint, or retry failed looks once more before giving up. (Terms currently say refund only on *failure to deliver*, so you're covered legally; this is a goodwill call.)
- **ACTION — verify in Stripe dashboard that the webhook endpoint is actually registered** (`https://headshotswithabird.com/api/stripe/webhook`, event `checkout.session.completed`) and ideally set `STRIPE_WEBHOOK_SECRET`. Without the webhook, delivery depends entirely on the user returning to the success URL — close the tab during checkout and the job never starts.

## 3. Data loss / infra (the quiet killer for a beta)

- **ACTION (high) — Render free tier = ephemeral disk + spin-down.** Three consequences:
  1. `data/` (captured emails, reviews, pro-interest clicks, bird-assignment uniqueness) **resets on every deploy/restart**. You'll lose your beta email list.
  2. In-memory jobs die on restart — anyone mid-generation at deploy time loses their paid job.
  3. Free instances spin down after idle; first visitor waits ~30-60 s for cold start. Bad first impression on a Reddit click-wave.
  Recommendation: Starter plan + 1 GB disk + `DATA_DIR=/var/data` before sharing the link. `render.yaml` is updated with the recipe (it also previously said `PROVIDER=replicate` with no `GEMINI_API_KEY` — a Blueprint redeploy would have silently downgraded your image quality; fixed).
- **ACTION (high) — confirm email delivery is live.** Results exist for 2 h in memory; the email is the user's only permanent copy, and the failure-recovery copy in the UI says "will be emailed to you." After deploying, check `/healthz` shows `"emailEnabled": true` (new flag). If you haven't set `RESEND_API_KEY` in Render, that's the single most important pre-beta action. Also send yourself one real run and check it's not in spam (SPF/DKIM on the Resend domain).
- **Note — results page link dies after 2 h** (was 30 min). This is inherent to in-memory storage; the email mitigates it. Persisting results to disk/S3 is the LATER fix that also unlocks share pages.

## 4. Abuse / security

- **FIXED — Stored XSS via reviews.** Review text/name/bird name were injected into the homepage carousel with raw `innerHTML`. A malicious review approved by a sleepy admin would run script on every visitor's browser. Now escaped (plus star-count is clamped).
- **FIXED — Anonymous image hosting / SSRF via `/api/review`.** `featuredSrc` accepted any URL; the server fetched it and served the result from your domain (`/review-media/...`) — before approval. Anyone could host arbitrary images on headshotswithabird.com or point your server at internal URLs. Media is now persisted only when it matches a server-generated result for a real job.
- **FIXED — A hung Gemini call stalled a look forever** (fetch had no timeout, hang ≠ error so no retry). 120 s abort added.
- **OK as-is for beta:** 12 MB × 2 multer memory uploads with no pre-payment rate limit (DoS-able in theory; daily cap + job purge bound it); `/api/stats` and `/healthz` are public and reveal sales volume (`totalAssigned`) — harmless, but know it's visible; HEIC conversion is CPU-bound on the request thread (fine at beta scale).
- **ACTION — confirm `ADMIN_KEY` is set in prod** (new `/healthz` flag: `adminEnabled`). Admin auth via query-string key is weak but acceptable for a one-person beta — don't share admin URLs from your browser history.

## 5. UX / front-end

- **FIXED — Polling died on one network blip.** A single failed fetch (phone locked, wifi handoff) froze the progress bar forever with no message. Now retries up to 15× then explains that results will arrive by email.
- **FIXED — unknown URLs returned Express's ugly "Cannot GET /foo"** — now redirect home (API paths get JSON 404).
- **OK / verified by reading:** HEIC placeholder thumbnails, mobile share-sheet vs desktop download branching, payment-canceled banner, duplicate-photo cap, review word-count gating, card export via html2canvas (data-URI images are same-origin, so no CORS taint).
- **LATER — no analytics at all.** You won't know where the funnel leaks (upload → pay → share). A one-line Plausible/GoatCounter snippet (no cookie banner needed) before launch would pay for itself. Didn't add a third-party script without your say-so.
- **LATER — `?job=...&paid=1` URLs are shareable** while the job lives; anyone with the link sees the results. 2 h window, UUID-guessing infeasible — fine for beta.

## 6. Legal / copy (read, no changes)

Terms and privacy are solid for what this is: parody disclaimer, photo-retention policy matches the actual code behavior (uploads dropped post-generation — true: `job.photos = null`), biometric-consent paragraph present, England & Wales governing law. Two notes: the marketing-email checkbox promises "unsubscribe at any time" but there's no unsubscribe mechanism yet — fine until you actually send a campaign; and the refund FAQ says "all sales final" while auto-refund now exists for total failure — consistent, no change needed.

---

## Pre-launch checklist (in order)

1. Commit + push (autoDeploy is on) — this ships OG tags, og.png, and all fixes.
2. Render: upgrade to Starter + attach disk + set `DATA_DIR=/var/data`.
3. Render env: confirm `RESEND_API_KEY`, `ADMIN_KEY`, `FREE_CODES`, and ideally `STRIPE_WEBHOOK_SECRET` are set.
4. Stripe: confirm the webhook endpoint is registered; confirm you're on **live** keys.
5. `curl https://headshotswithabird.com/healthz` — want `emailEnabled:true`, `webhookSecretSet:true`, `adminEnabled:true`, `freeCodes:>0`.
6. One real $1 end-to-end run on your phone (HEIC photo, Stripe payment, email received, card shared to LinkedIn).
7. LinkedIn Post Inspector on `https://headshotswithabird.com/` to prime the preview cache.
8. Decide the partial-failure policy (§2) before testers hit it.
