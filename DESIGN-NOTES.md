# Design pass — parked (2026-07-04)

Status: **not shipped.** A design pass was attempted, went wrong twice, and was
reverted (`git revert f626379` un-reverts commit `d4bbbb7` if you ever want the
diff back to reference — don't ship it as-is). This file is the context for
picking the work up properly.

## The brief (still valid)

Make the landing page feel bespoke and original — remove the "vibe coded
tells" — with **zero functional or branding changes**. James's words: minor
pass, spruce it up.

## The tells identified (worth fixing, in rough priority)

- Nav pill top-right (`.pill` — "$1 · 5 clean headshots · 1 bird")
- Hero status-dot badge (`.badge` + green `.dot`) — the classic AI-site pattern
- Uniform soft shadow (`--shadow: 0 10px 40px`) on every card, uniform 18px radii
- "How it works" numbered circles (`.step .n`)
- Pricing section: strikethrough was-price + yellow "Save 97%" pills + "Most
  popular" ribbon — template-grade, though arguably on-joke for a parody
- Body/heading typography is all one generic sans stack (`Inter` is referenced
  in CSS but never actually loaded — everything falls back to system sans)
- Emoji used as icons throughout (📸 dropzone, ✓ chips, 🐦)

## What was tried and why it was wrong (do not repeat)

1. **Dela Gothic One + JetBrains Mono** — retired scheme.studio fonts. Dead end.
2. **Fraunces 900 + Space Mono** — these are the *current scheme.studio*
   identity (see the `.ss-cc` calling card in index.html). Applying them here
   dressed the product in the parent studio's clothes. The calling card should
   stay the ONLY place the studio identity appears on this site.

The structural moves (kill pill, kill status dot, hard offset shadows, mono-ish
step numerals) read well in renders — the *typography choice* was the failure.
Screenshots of the reverted attempt: `design-hero.png` / `design-plans.png` in
the Cowork outputs from 2026-07-04, if still around.

## Open direction for next time

Headshots with a Bird needs its **own** display voice — distinct from both
generic-AI-site and from scheme.studio. Its existing equity: brand green
`#10a37f`, orange `#ff5a3c`, paper `#f7f5ef`, the Bird ID trading-card motif,
field-guide/ornithology flavor, deadpan parody copy. Directions worth
exploring (pick with James, don't unilaterally ship):

- Field-guide / specimen-label aesthetic: serif or slab display that evokes
  vintage bird guides (e.g. something Clarendon/slab-ish), specimen-tag
  labels, ruled lines — ties into the Bird ID card without copying the studio.
- Lean into the trading-card language sitewide (the pkmn-style card is the
  most distinctive asset on the page).
- Whatever is chosen, load the font(s) explicitly — today nothing loaded is
  actually used by body/headings.

## Hard constraints

- All functionality and flow untouched: results grid, card pick, birdify
  states, tier picker JS hooks (`#tierpick`, `.pp-cta[data-tier]`, `#birdchooser`).
- The Bird ID card canvas (`drawCard()`) draws with Inter/system strings —
  keep DOM preview and canvas export visually in sync if card styles change.
- Brand palette stays. Copy stays (timeless voice — no build-history narration).
- Demo videos currently show the old bird-in-headshot product; decide
  separately whether to pull or reshoot (og.png likely same issue).
