# Design — "Print Shop" system SHIPPED (2026-07-15)

Status: **the Print Shop design is now the design system**, implemented sitewide
from James's approved design handoff (`design_handoff_homepage_redesign/README.md`,
delivered 2026-07-15). Tokens: paper `#EFEAE0`, card `#FDFBF5`, ink `#121212`,
green `#0D7A5C`, orange `#F2500A`, yellow `#F6C445`; Archivo Black display /
Archivo UI / IBM Plex Mono accents; 2px ink borders, offset solid shadows,
radius 0, press-down button hover. Landing copy is verbatim-final from the
handoff — do not rewrite it. Voice guide: short declarative, deadpan,
tongue-in-cheek about the bird, no exclamation marks, no emoji, no gradients.
Applied to: index.html (all sections + upload/results flow), privacy.html,
terms.html, the Bird ID card (DOM preview + `drawCard()` canvas export, kept in
sync), favicon (emoji bird retired). Hero example strip uses AI-generated
sample person in `public/examples/` — regenerate via
`scripts/gen-example-headshots.mjs` (reuses `public/examples/source-selfie.jpg`
for likeness consistency).

Extend this system; don't replace it. The history below is kept because the
lesson still applies: full design passes only with an explicit, signed-off
direction from James.

## History — original system retained, by choice (2026-07-04)

Three unsolicited redesign attempts were rejected — see the list below. The
conclusion at the time: do not attempt another visual redesign unless James
asks for one explicitly and signs off on a direction first. (The Print Shop
handoff above is exactly that sign-off.)

Commit `7596a08` ("Field Guide design system") shipped briefly on 2026-07-04
and was reverted the same day at James's request — the revert keeps the
zero-context copy pass but restores every visual to the pre-redesign system.

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
3. **"Field Guide" system (Besley + Courier Prime, flat print chrome, specimen
   tags, Fig. labels)** — commit `7596a08`, rejected by James 2026-07-04
   ("really bad, not getting it right AT ALL"). Technically clean execution,
   wrong outcome: a full-system reskin when the original design was already
   the preferred baseline. Lesson: the appetite was never for a new design
   language — treat any future request as narrow and incremental.

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
- Brand palette stays. Copy voice (updated 2026-07-04, KEEP): written for a
  zero-context visitor — no product-evolution narration, no "clean headshots"
  changelog vocabulary, no build-history. Gag stated forward: every order
  includes exactly one bird, on the Bird ID card. Hero: "Five serious
  headshots. One bird. $1." The one surviving "clean" is the hero badge line
  ("The headshots are clean. The bird is contained.") — kept as the deadpan
  answer to the question the brand name raises.
- Demo videos currently show the old bird-in-headshot product; decide
  separately whether to pull or reshoot (og.png likely same issue).
