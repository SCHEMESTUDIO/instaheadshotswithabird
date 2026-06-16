// ============================================================
//  THE LOOKS LIBRARY
//  Master list of 15 looks. Each pairs one outfit with one
//  backdrop. The assigned bird rides the shoulder in every one.
//  Outfits are gender-neutral by design — prompt.js does NOT
//  detect gender; the editor fits the garment to the person.
//
//  TIERS (wiring pending — see pricing-mockup-3tier.html):
//    $1  basic   → first 5 looks
//    $3  full    → all 15 looks
//    $10 aviary  → all 15 looks, plus a birdless variant of each
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
];

// Back-compat: the live $1 product imports LOOKS and gets the original 5.
// Existing behavior is unchanged until tier selection is wired in.
export const LOOKS = ALL_LOOKS.slice(0, 5);

// Tier → look set. Ready for when checkout passes a tier through to the job.
// Defaults to the 5-look basic set so nothing changes today.
export function looksForTier(tier) {
  switch (tier) {
    case "full":         // $3
    case "aviary":       // $10
    case "premium":      // (Stripe SKU aliases, if reused)
    case "premium_plus":
      return ALL_LOOKS;
    default:             // $1 basic / unknown
      return ALL_LOOKS.slice(0, 5);
  }
}
