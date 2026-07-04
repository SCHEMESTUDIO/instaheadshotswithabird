# Design system — "The Field Guide" (applied 2026-07-04, in working tree, not yet committed)

Status: **applied to `public/index.html`, awaiting James's review/commit.**
Two earlier attempts (Dela Gothic/JetBrains, then Fraunces/Space Mono) failed on
typography and were reverted — that history and the tell-list live in git
(`d4bbbb7` via `git revert f626379`) and in this file's previous revision.

## The voice

**Helpful ornithologist.** Witty, self-aware, deliberately unlike the sterile
SaaS look of other AI headshot brands. The copy already spoke this way; the
design now matches it.

- **Display: Besley** (Clarendon slab — the letterform family of vintage
  natural-history plates). Weights 800–900, letter-spacing ~-.01em.
- **Labels: Courier Prime** (typewritten specimen tags). Distinct from Space
  Mono (studio) and JetBrains Mono (retired).
- **Body: system sans, on purpose.** The guide is set in slab, the instrument
  in sans. Nothing referenced-but-unloaded anymore (Inter removed).
- Fraunces 900 + Space Mono still load but are used ONLY by the `.ss-cc`
  scheme.studio calling card. Do not let them leak elsewhere.

## What replaced each tell

- Nav pill → **specimen tag** (mono, square, punched hole via `::before`); nav
  got a thick-thin double masthead rule; 4px brand rule at top of `<body>`.
- Hero status-dot badge → **fig-caption** (mono italic, hairline rules flanking).
- Uniform soft shadow → **flat print**: `--shadow:none`, 1px borders, the tool
  and modal get double frames (`border` + offset `outline`). Radii 18→10/8.
- "How it works" circles → **"Fig. 1/2/3"** mono plate labels (markup changed
  `1`→`Fig. 1` — chrome, not copy).
- Pricing: ribbons → square mono tags; "Save 97%" pill → bordered ledger stamp
  (still accent yellow); prices in Besley 900; benefit-icon bubbles removed;
  feature card = double green rule instead of glow.
- 📸 dropzone emoji → inline SVG **line-drawn camera with a bird perched on
  it** (decorative, `aria-hidden`). Emoji elsewhere (🐦, 🪶) kept — they're voice.
- FAQ boxes → ruled index (top/bottom hairlines, Besley summaries).
- Compare table: ink border, 2px rule under thead.

## Hard constraints (all held)

- JS hooks untouched: `#tierpick`, `.pp-cta[data-tier]`, `#birdchooser`,
  `#sharecard`, `#cardpick` — verified by grep after the pass.
- **Bird ID card DOM ↔ canvas sync:** `drawCard()` now has `FS()` (Besley) and
  `FM()` (Courier Prime) helpers; radii 16/10/8/4 match the CSS. Verified by
  rendering the actual canvas export headlessly — matches the DOM preview.
  If you touch `.pkmn-*` styles, change `drawCard()` in the same commit.
- Palette and copy unchanged.

## Copy voice (pass done 2026-07-04, same session)

Rule: **write for a visitor with zero context on the product's evolution.**
No changelog vocabulary ("clean", "no bird in them" as reassurance-of-change),
no build-history ("we built it in 2 days", "in our trials", "for the first
time ever"). The gag is stated forward: every order includes exactly one bird,
non-negotiably, on your Bird ID card. Matter-of-fact answers + deadpan cheek.

- Hero: "Five serious headshots. One bird. $1."
- The ONE surviving "clean" is the hero fig-caption — "The headshots are
  clean. The bird is contained." — kept deliberately as the deadpan safety
  notice answering the brand-name question. If it ever grates, it dies alone.
- About: bird-bot lore kept (it's the joke's foundation), design-decision
  narration removed; "Negotiations failed. The treaty we reached:" carries it.
- OG/twitter/meta all rewritten to match.

## Mobile (pass done 2026-07-04)

- ≤560px layer at end of stylesheet: compact nav/specimen tag, shorter
  fig-caption rules, tighter tool/modal/table padding, bigger touch targets on
  cardpick, flexing res-action buttons. ≤380px: nav tag hides entirely.
- Besley load trimmed to used axes (0,700..900; 1,400..500) for cellular.
- Verified headless at 390×844: scrollWidth 390 (no horizontal overflow),
  hero/plans/tool/how/faq/about eyeballed (`m-*.png` in Cowork outputs).

## Verification done / caveats

- Headless Chromium render, desktop 1280px AND mobile 390px: hero, nav, plans,
  tool, how, faq, about, DOM card, and the real `drawCard()` PNG export — all
  checked visually with webfonts confirmed loaded.
- Emoji render as tofu in the sandbox screenshots (no emoji font there) — not
  a real bug, but eyeball 🐦/🪶 on a real device once.
- Canvas export on a client that hasn't finished loading Besley falls back to
  Georgia; postCard retries make this unlikely to matter.
- Still open: demo videos + og.png show the old bird-in-headshot product;
  decide separately whether to reshoot.
