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
      → 16/20 DEAD. Composite-dominated (13).
- [x] **T2 — One photo.** Same model, 1 photo.
      → 12/17 DEAD, but **1 photo won** (composites halved). Failure modes: composite
      head vs uncanny likeness — photo count only trades one for the other on NB1.
- [x] **T3 — Nano Banana 2** (`gemini-3.1-flash-image`), 1 photo.
      → 11/20, composite SOLVED (re-renders its copies). Uncanny (8) traced by James
      to the model SWITCHING expression vs the reference → testable hypothesis → T7.
- [x] **T7 — NB2 + preserve-expression prompt.** ★ **WINNER — 1/20 (composite:1).**
      Uncanny 8→0, hair 3→0 once the prompt stopped inviting invented expressions.
      **SHIPPED 2026-06-10:** prompt baked into `lib/prompt.js`, default model →
      `gemini-3.1-flash-image` in `lib/providers/gemini.js`, `CONCURRENCY` default → 5
      (15.7s/render serial would break the one-minute promise; parallel ≈ 20s/job).
- [ ] **T4 — Flux Kontext Pro** (Replicate, 1 photo — single-image model).
      *Not run — winner found first. Optional curiosity.*
- [ ] **T5 — Qwen image edit** *(optional — only if a future model search reopens).*
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
| T3 | gemini-3.1-flash-image | 1 | 11/20 | other:8 hair:3 | 9.2s |
| T7 | gemini-3.1-flash-image | 1 | 1/20 | composite:1 | 15.7s |

## Notes

- Panel: 4 real faces in `scripts/calibrate/realfaces/` (2 photos each). Same panel,
  same looks, same per-person bird in every test — the config is the only variable.
- `results/` is **gitignored**: it contains real faces and must never be pushed.
- Old `scripts/calibrate/gen.js` is dead (imports modules deleted in the v3.0
  simplification) — this folder replaces it for model/config decisions.
