# InstaHeadshots with a Bird 🐦

Upload two selfies → pay **$1** → get **5** professional headshots (5 outfits, 5 backdrops), each
starring the single bird paired to you, plus a shareable **Bird ID**. The bird cannot be removed.
After downloading/sharing, users can leave a star review — approved ones feed the homepage carousel.

## The flow

1. Upload one or two selfies (no choices to make — everyone gets all 5 looks).
2. We assign a bird (hidden until paid; no repeats until the 148-bird roster is exhausted).
3. Stripe Checkout, $1.
4. On return, payment is verified and 5 headshots generate in parallel (Gemini; set PROVIDER=replicate for the Flux Kontext fallback).
5. User downloads/shares → prompted for a review (stars + ≤30 words + consent).

The 5 looks (`lib/looks.js`): Black Tee · White Shirt · Navy Polo · Black Turtleneck · Charcoal Cardigan.
Outfit per look is fixed; we do **not** detect gender — the editor fits the outfit to the actual photo.
The bird prompt is injected server-side every call; there's no client control to disable it.

## Run it

```bash
cd instaheadshotswithabird
npm install
cp .env.example .env      # paste keys, then:
npm start                 # → http://localhost:3000
```

### Test today with just your Replicate key (DEV BYPASS)

If `STRIPE_SECRET_KEY` is unset, payment is skipped so you can test generation now. Set
`REPLICATE_API_TOKEN`, run, upload a photo → real headshots. Console shows `payments: DEV BYPASS`.

### Turn payments on

Add Stripe **test** keys to `STRIPE_SECRET_KEY` (test card `4242 4242 4242 4242`). For production use
live keys + set `PUBLIC_URL`. Optional webhook at `/api/stripe/webhook` (`STRIPE_WEBHOOK_SECRET`) as a
backstop; the success-redirect already verifies payment server-side.

## Reviews & the homepage carousel

- After download/share, a modal collects: **stars (1–5)**, **≤30-word text**, optional name, and a
  consent checkbox to feature the headshot.
- Reviews save to `data/reviews.json`; the featured headshot is copied to `data/review-media/` so the
  carousel survives the provider's image URL expiring.
- Reviews are **`approved: false` by default.** Only approved ones appear in the public carousel —
  you curate which beta reviews go live.

### Approving reviews

Set `ADMIN_KEY` in `.env`, then:

```bash
# list everything (incl. unapproved)
curl "http://localhost:3000/api/admin/reviews?key=YOUR_ADMIN_KEY"
# approve one
curl -X POST http://localhost:3000/api/admin/approve \
  -H "Content-Type: application/json" \
  -d '{"key":"YOUR_ADMIN_KEY","id":"REVIEW_ID","approved":true}'
```

Or just edit `data/reviews.json` and set `"approved": true`.

## Unit economics ($1, 5 images)

| Line | Amount |
|---|---|
| Revenue | **$1.00** |
| Stripe (2.9% + $0.30) | −$0.329 |
| Gemini NB2 (5 images @ ~$0.067) | −$0.335 |
| **Net profit / sale** | **≈ $0.34 (34%)** |

Model is `gemini-3.1-flash-image` (Nano Banana 2) — bake-off winner at 1/20
embarrassing failures vs 12–16/20 for the cheaper `gemini-2.5-flash-image`
(see `scripts/bakeoff/PLAN.md`). The 13pts of margin buy the quality.

Stripe's $0.30 flat fee is still the biggest single cost. Levers: raise price, or cut to fewer images.
Failed generations auto-retry once; persistent failure tells the user their $1 will be refunded.

## Scale caveats

- **Bird uniqueness:** 148 birds, then it recycles. Add more in `lib/birds.js`.
- **Bird facts** are common-knowledge, not individually fact-checked.
- **State is single-instance:** assignments, jobs, and reviews live on one server / local disk. To scale
  horizontally, move state + media to a shared store (Redis/Postgres + S3).

## Layout

```
server.js              upload → Stripe → verify → generate 5 → reviews + admin
lib/birds.js           148 birds + Bird ID copy
lib/looks.js           the 5 looks (outfit + backdrop)
lib/prompt.js          per-look outfit + backdrop + bird → prompt
lib/assign.js          no-repeat bird allocation (file-backed)
lib/reviews.js         review storage + featured-image persistence + approval
lib/providers/         replicate.js (default) · gemini.js · index.js
public/index.html      upload, checkout, 5-image result, review modal, carousel
data/                  assignments.json · reviews.json · review-media/
```

A parody project. Not affiliated with any other headshot service.
