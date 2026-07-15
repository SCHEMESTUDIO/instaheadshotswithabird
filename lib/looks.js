// ============================================================
//  THE LOOKS LIBRARY
//  Master list of 25 looks. Each pairs one outfit with one
//  backdrop. As of 2026-07-04 every look renders CLEAN (no bird);
//  the bird is composited onto one user-picked shot afterwards.
//  Outfits are gender-neutral by design — prompt.js does NOT
//  detect gender; the editor fits the garment to the person.
//
//  TIERS (clean-headshot hero):
//    $1  basic   → first 5 looks
//    $3  full    → first 10 looks
//    $10 aviary  → all 25 looks + choose-your-bird
//
//  IMPORTANT: the first 5 entries are the original live $1 set,
//  kept verbatim so `LOOKS` (= ALL_LOOKS.slice(0,5)) reproduces
//  today's product exactly. Append new looks; do not reorder.
// ============================================================

export const ALL_LOOKS = [
  // ---- original 5 (the live $1 product — do not edit/reorder) ----
  {
    id: "black-tee", label: "Black Tee",
    outfit: "a plain well-fitted black t-shirt",
    background: "an industrial creative loft with exposed brick and large windows",
  },
  {
    id: "white-shirt", label: "White Shirt",
    outfit: "a crisp white collared dress shirt, open collar, no tie",
    background: "a softly blurred modern open-plan office with warm natural light",
  },
  {
    id: "navy-polo", label: "Navy Polo",
    outfit: "a navy blue polo shirt",
    background: "a softly blurred park in warm, even golden-hour light with gentle green-and-amber bokeh",
  },
  {
    id: "black-turtleneck", label: "Black Turtleneck",
    outfit: "a fitted black turtleneck",
    background: "a warm library setting with wooden bookcases softly blurred behind",
  },
  {
    id: "charcoal-cardigan", label: "Charcoal Cardigan",
    outfit: "a plain black shirt layered under an open charcoal-grey shawl-collar cardigan",
    background: "a clean soft neutral grey studio backdrop",
  },

  // ---- new 10 (drafted 2026-06-16 for the $3 / $10 tiers) ----
  {
    id: "navy-blazer", label: "Navy Blazer",
    outfit: "a tailored navy blazer over a plain white crew-neck tee",
    background: "a softly blurred upscale hotel lobby with warm ambient light",
  },
  {
    id: "olive-overshirt", label: "Olive Overshirt",
    outfit: "an olive-green cotton overshirt worn open over a plain grey t-shirt",
    background: "a sunlit minimalist studio with a warm beige backdrop",
  },
  {
    id: "denim-jacket", label: "Denim Jacket",
    outfit: "a classic mid-blue denim jacket over a plain white tee",
    background: "a softly blurred city street at golden hour with gentle warm bokeh",
  },
  {
    id: "grey-crewneck", label: "Grey Crewneck",
    outfit: "a fine-knit heather-grey crew-neck sweater",
    background: "a clean soft white studio backdrop with even, flattering light",
  },
  {
    id: "light-blue-oxford", label: "Light Blue Oxford",
    outfit: "a light blue button-down oxford shirt, open collar, no tie",
    background: "a softly blurred sunlit café with warm wood tones behind",
  },
  {
    id: "burgundy-sweater", label: "Burgundy Sweater",
    outfit: "a soft burgundy fine-knit sweater layered over a collared shirt",
    background: "a softly blurred contemporary art gallery with pale walls and gentle track lighting",
  },
  {
    id: "charcoal-suit", label: "Charcoal Suit",
    outfit: "a sharp charcoal suit jacket over a crisp white shirt, open collar",
    background: "a softly blurred modern glass-walled boardroom with cool daylight",
  },
  {
    id: "forest-henley", label: "Forest Henley",
    outfit: "a forest-green waffle-knit henley with the top button open",
    background: "a softly blurred wall of lush green foliage in gentle natural light",
  },
  {
    id: "camel-coat", label: "Camel Coat",
    outfit: "a camel-tan overcoat over a dark crew-neck top",
    background: "a softly blurred rooftop terrace at dusk with city lights as soft bokeh",
  },
  {
    id: "black-blazer", label: "Black Blazer",
    outfit: "a sleek black blazer over a black fine-knit top",
    background: "a softly blurred industrial concrete wall with cool directional light",
  },

  // ---- new 10 (drafted 2026-07-04 for the 25-look $10 tier) ----
  {
    id: "cream-knit", label: "Cream Knit",
    outfit: "a cream cable-knit crew-neck sweater",
    background: "a softly blurred bright coastal interior with pale, airy light",
  },
  {
    id: "leather-jacket", label: "Leather Jacket",
    outfit: "a classic black leather jacket over a plain white t-shirt",
    background: "a softly blurred evening city street with warm neon bokeh",
  },
  {
    id: "white-linen", label: "White Linen",
    outfit: "a relaxed white linen shirt with the top button open",
    background: "a bright, airy studio with a warm sand-coloured backdrop",
  },
  {
    id: "navy-suit", label: "Navy Suit",
    outfit: "a tailored navy suit jacket over a light-blue shirt, no tie",
    background: "a softly blurred corner office with floor-to-ceiling windows and daylight",
  },
  {
    id: "mustard-sweater", label: "Mustard Sweater",
    outfit: "a mustard-yellow fine-knit crew-neck sweater",
    background: "a softly blurred autumn park with golden foliage bokeh",
  },
  {
    id: "stone-utility", label: "Stone Utility",
    outfit: "a stone-coloured utility overshirt over a plain white tee",
    background: "a softly blurred bright workshop with warm natural light",
  },
  {
    id: "teal-quarter-zip", label: "Teal Quarter-Zip",
    outfit: "a teal quarter-zip pullover over a white collared shirt",
    background: "a softly blurred modern campus courtyard in soft daylight",
  },
  {
    id: "pinstripe", label: "Pinstripe",
    outfit: "a charcoal pinstripe suit jacket over a black crew-neck top",
    background: "a softly blurred upscale restaurant interior with warm low light",
  },
  {
    id: "lavender-oxford", label: "Lavender Oxford",
    outfit: "a soft lavender button-down oxford shirt, open collar",
    background: "a clean pale-grey studio backdrop with gentle side light",
  },
  {
    id: "rust-chore", label: "Rust Chore Jacket",
    outfit: "a rust-coloured cotton chore jacket over a cream tee",
    background: "a softly blurred brick wall in warm afternoon light",
  },
];

// Back-compat: the live $1 product imports LOOKS and gets the original 5.
export const LOOKS = ALL_LOOKS.slice(0, 5);

// Tier → look set (2026-07-15 bird-by-default pivot: every look renders WITH
// the bird — the bake-off-validated path. Birdless variants are derived from
// the finished bird shots via a DEBIRD edit, never generated fresh):
//   basic  ($1)  → 5 looks with bird (+1 on-demand de-bird of the user's pick)
//   full   ($3)  → 5 looks × 2 ways (bird + birdless)          = 10 images
//   aviary ($10) → first 15 looks × 2 ways + choose-your-bird  = 30 images
// The last 10 of ALL_LOOKS (2026-07-04 batch) are retired from sale.
export function looksForTier(tier) {
  switch (tier) {
    case "full":         // $3 → 5 looks, delivered 2 ways
    case "premium":      // (Stripe SKU aliases, if reused)
      return ALL_LOOKS.slice(0, 5);
    case "aviary":       // $10 → 15 looks, delivered 2 ways
    case "premium_plus":
      return ALL_LOOKS.slice(0, 15);
    default:             // $1 basic / unknown → 5 looks
      return ALL_LOOKS.slice(0, 5);
  }
}

// How many images a job of this tier generates up front (bird set + derived
// birdless set for the paid-up tiers). The basic tier's single on-demand
// de-bird is billed separately when the user locks in their pick.
export function imagesForTier(tier) {
  const n = looksForTier(tier).length;
  return tier === "basic" || !tier ? n : n * 2;
}
