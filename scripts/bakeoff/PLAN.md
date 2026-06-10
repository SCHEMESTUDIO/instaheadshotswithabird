# Model bake-off — the checklist

**Goal:** find the config (model + photo count) with the lowest *embarrassing-failure*
rate at production speed. No runtime gates, no re-rolls — quality control happens here,
at release time, then we ship a config via env vars and nothing else changes.

**One test = one question = ~20 renders (~$1) = ~5 min of ticking boxes.**

## How to run a test

```bash
node scripts/bakeoff/run.js T1          # prints plan + cost, spends nothing
node scripts/bakeoff/run.js T1 --yes    # runs it (~$1)
# then open scripts/bakeoff/results/T1/review.html and tick failure boxes
# click "Copy scoreboard row" and paste it into the scoreboard below
```

Failure classes (tick any that apply): gender swap · wrong/extra hair · composited
head · head not centred · bird wrong · other. **A render fails if ANY box is ticked.**

## The tests — do them in order

- [x] **T1 — Baseline.** `gemini-2.5-flash-image` (Nano Banana, stable), 2 photos.
      *Establishes the failure rate of the cheapest viable config. Judged-against by all others.*
      (Note: the old `-preview` alias was retired by Google on ~2026-06 and 404s — prod
      default fixed in `lib/providers/gemini.js` the same day.)
- [x] **T2 — One photo.** Same model, 1 photo.
      *Settles the 1-vs-2 question with data. Winner's photo count is used from here on.*
      → **1 photo won** (composites 6/17 vs 13/20). Both T1 and T2 are DEAD per rule 1;
      failure modes are (a) pasted-on composite head, (b) uncanny likeness. T3+ run 1-photo.
- [ ] **T3 — Nano Banana 2** (`gemini-3.1-flash-image`), T1/T2-winner photo count.
      *Costs 13pts of margin @ $1 — must visibly beat T1's failure rate to earn it.*
- [ ] **T4 — Flux Kontext Pro** (Replicate, 1 photo — single-image model).
      *The cross-vendor identity-preservation benchmark. ~$0.08/img → 27% margin @ $1.*
- [ ] **T5 — Qwen image edit** *(optional — only if T3/T4 both disappoint).*
      Fill the model slug in `configs.js` from replicate.com first.
- [ ] **T6 — Nano Banana Pro** (`gemini-3-pro-image`) *(optional — $1.99 tier only).*
      *~$0.134/img → ZERO margin @ $1. Only run if entertaining the $1.99 price; only
      ship if quality is MAJORLY better than the T1–T3 winner — "slightly better" loses.*

## Margin table (5 images/job, Stripe 2.9% + $0.30) — verify prices on Google's pricing page

| Model | $/img (1K) | Profit @ $1.00 | Profit @ $1.99 |
|---|---|---|---|
| gemini-2.5-flash-image (NB1) | ~$0.04 | $0.47 (47%) | $1.43 (72%) |
| gemini-3.1-flash-image (NB2) | ~$0.067 | $0.34 (34%) | $1.30 (65%) |
| flux-kontext-pro | ~$0.08 | $0.27 (27%) | $1.23 (62%) |
| gemini-3-pro-image (NB Pro) | ~$0.134 | ~$0.00 — dead | $0.96 (48%) |

## Decision rules — agreed up front so we stop on time

1. A config is **dead** at >2 failed renders out of 20. Stop considering it.
2. **Winner** = fewest failed renders; tie → fastest avg seconds/render; still tied → cheapest.
3. Ship the winner by setting `GEMINI_MODEL` (and/or `PROVIDER`) + photo guidance in copy.
   **No code changes to ship a winner. No new middleware, ever, off the back of this.**
4. Framing: if the winner still fails the "head not centred" box >1/20, the next step is
   a fixed output-aspect API parameter (check Gemini docs), NOT prompt re-tuning loops.

## Scoreboard

| Test | Model | Photos | Failed/Total | By class | Avg s/render |
|---|---|---|---|---|---|
| T1 | gemini-2.5-flash-image | 2 | 16/20 | composite:13 other:3 | 10.9s |
| T2 | gemini-2.5-flash-image | 1 | 12/17 | composite:6 other:6 | 9.7s |
## Notes

- Panel: 4 real faces in `scripts/calibrate/realfaces/` (2 photos each). Same panel,
  same looks, same per-person bird in every test — the config is the only variable.
- `results/` is **gitignored**: it contains real faces and must never be pushed.
- Old `scripts/calibrate/gen.js` is dead (imports modules deleted in the v3.0
  simplification) — this folder replaces it for model/config decisions.
