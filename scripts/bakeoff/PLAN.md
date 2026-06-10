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

- [ ] **T1 — Baseline.** Prod config exactly (current Gemini model, 2 photos).
      *Establishes today's failure rate. Everything else is judged against this.*
- [ ] **T2 — One photo.** Same model, 1 photo.
      *Settles the 1-vs-2 question with data. Winner's photo count is used from here on.*
- [ ] **T3 — Newest Gemini model.** Run `node scripts/bakeoff/run.js --list-models`,
      paste the current image model into `configs.js`, set `photos` to the T1/T2 winner.
      *Prod default `gemini-2.5-flash-image-preview` may be deprecated.*
- [ ] **T4 — Flux Kontext Pro** (Replicate, 1 photo — single-image model).
      *The cross-vendor identity-preservation benchmark.*
- [ ] **T5 — Qwen image edit** *(optional — only if T3/T4 both disappoint).*
      Fill the model slug in `configs.js` from replicate.com first.

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
<!-- paste copied rows here -->

## Notes

- Panel: 4 real faces in `scripts/calibrate/realfaces/` (2 photos each). Same panel,
  same looks, same per-person bird in every test — the config is the only variable.
- `results/` is **gitignored**: it contains real faces and must never be pushed.
- Old `scripts/calibrate/gen.js` is dead (imports modules deleted in the v3.0
  simplification) — this folder replaces it for model/config decisions.
