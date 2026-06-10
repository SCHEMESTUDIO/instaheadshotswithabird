# Likeness calibration harness

Tunes `SIM_THRESHOLD` (the re-roll quality gate in `server.js`) from labelled data
instead of guessing. Three steps: **generate + score → label → read the threshold.**

The point isn't just to pick a number. It's to first answer the question hiding
underneath it: **can the face-match score even tell a good render from an uncanny
one?** If it can't (low AUC), no threshold will fix the uncanny problem and you're
better off changing the prompt/provider/restore pass. The register tells you which
world you're in before it hands you a number.

---

## Try it with zero spend first

Open **`out/register.demo.html`** in a browser. It's the real labelling UI loaded
with placeholder images and a separable score distribution. Click through
*Keep / Re-roll* (or press **K** / **J**) and you'll see the results screen:
AUC, the recommended `SIM_THRESHOLD`, and the cost/accuracy tradeoff table.
Nothing is generated, no money spent — it just shows you the loop.

---

## Step 1 — generate + score  (`gen.js`)  · costs money

Reuses the exact production pipeline (`lib/providers`, `lib/prompt`,
`lib/similarity`) with the gate's re-roll switched **off**, so you capture the raw,
un-gated score distribution. Inputs are synthetic GAN faces
(thispersondoesnotexist.com) by default — no real person, no privacy/licence issue.

```bash
# prints the plan + a spend estimate, generates nothing:
node scripts/calibrate/gen.js --faces 8 --samples 2

# actually run it (needs REPLICATE_API_TOKEN in .env):
node scripts/calibrate/gen.js --faces 8 --samples 2 --yes
```

`8 faces × 3 looks × 2 samples = 48 renders ≈ $3.90`. It refuses to exceed
`--max-cost` (default $10) and never spends without `--yes`.

Use your own faces instead: `--faces-dir ./my-selfies` (any jpg/png).

Writes to `scripts/calibrate/out/`:
- `renders/` + `faces/` — the images
- `manifest.json` — every render's score, look, bird, face counts
- `register.html` — the labelling UI with thumbnails baked in

## Step 2 — label  (`register.html`)

Open `out/register.html`. For each render you see **their selfie next to the AI
render** and decide: *does this convincingly look like the same person?*
**The score is hidden while you label** — on purpose, so the number doesn't bias
your eye. Keyboard: **K** = keep, **J** = uncanny/re-roll, **S** = skip, **Backspace** = undo.

When you finish it reveals:
- **AUC** — the headline. ≥0.80 = the score separates good from uncanny, tune away.
  0.65–0.80 = partial, a threshold helps but misses subtle cases. <0.65 = the score
  can't tell them apart; **don't ship a threshold, fix likeness upstream.**
- **Recommended `SIM_THRESHOLD`** (only shown when AUC supports it), chosen to
  maximise *(uncanny caught − good wrongly re-rolled)*.
- **Tradeoff table** — at each candidate cut: % uncanny caught, % good wrongly
  re-rolled, % renders re-rolled, and the added $/render. Pick lower for fewer
  annoyed customers, higher to catch more uncanny.

"Download labels.json" saves your calls for the record / step 3.

## Step 3 — fit headless (optional)  (`fit.js`)

Same math as the register, on the command line — for auditing or re-running after
you edit labels.

```bash
node scripts/calibrate/fit.js   # reads out/manifest.json + out/labels.json
```

---

## Caveats (read before trusting the number)

- **Synthetic, single-photo inputs score a touch low** vs production's two-photo
  jobs, and clean GAN portraits aren't phone selfies. So treat the absolute cut as a
  **ballpark**. What transfers reliably is the *separation* (AUC); the exact number
  should be confirmed on a handful of real jobs (set `SIM_THRESHOLD=0` in Render,
  read the logged `score` lines, adjust — your original plan, now with a starting
  value instead of a blind guess).
- **Small samples are noisy.** Label ≥10 keep and ≥10 uncanny before believing the
  threshold; the register warns you below ~3 of each.
- **The gate only catches what the score sees.** If your real uncanny renders score
  *high*, that's the AUC<0.65 case — the fix is upstream, not a threshold.
