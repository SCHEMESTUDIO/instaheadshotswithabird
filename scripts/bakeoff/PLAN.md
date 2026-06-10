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

- [x] **T1 — Baseline.** NB1, 2 photos → **16/20 DEAD** (composite-dominated).
- [x] **T2 — One photo.** NB1, 1 photo → **12/17 DEAD**, but composites halved.
      On a weak model, photo count only trades composite (2-photo) for uncanny (1-photo).
- [x] **T3 — Nano Banana 2**, 1 photo → **11/20 DEAD**, but composite SOLVED.
      James traced uncanny to the model SWITCHING expression vs the reference → T7.
- [x] **T7 — NB2 + preserve-expression prompt** → ★ **1/20 — WINNER, SHIPPED 2026-06-10**
      (prompt baked into lib/prompt.js, default model gemini-3.1-flash-image,
      CONCURRENCY 5). Uncanny 8→0, hair 3→0.
- [x] **T8 — Prod config + 2 photos** → **5/20 DEAD** (minor uncanny + hair drift =
      reference-disagreement blending). But peaks were the best of all tests — the
      2-photo high-ceiling mode is worth revisiting IF a user-triggered re-roll ships
      to mop up the fatter tail. Site copy flipped to recommend ONE photo (2026-06-10).
- [ ] **T4 — Flux Kontext Pro** *(not run — winner found first; optional curiosity).*
- [ ] **T5 — Qwen image edit** *(optional — only if a future model search reopens).*
- [ ] **T6 — Nano Banana Pro** *(optional — only if a ~$1.99+ tier is on the table:
      ~$0.134/img → zero margin @ $1; ship only if MAJORLY better than T7).*

**VERDICT: bake-off closed 2026-06-10.** Prod = NB2 + preserve-expression + 1 photo
recommended. Reopen by adding a config and rerunning — never by tuning in prod.

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
| T8 | gemini-3.1-flash-image | 2 | 5/20 | hair:1 other:3 composite:1 | 10.3s |

## Notes

- Panel: 4 real faces in `scripts/calibrate/realfaces/` (2 photos each). Same panel,
  same looks, same per-person bird in every test — the config is the only variable.
- `results/` is **gitignored**: it contains real faces and must never be pushed.
- Old `scripts/calibrate/gen.js` is dead (imports modules deleted in the v3.0
  simplification) — this folder replaces it for model/config decisions.
