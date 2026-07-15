// ============================================================
//  Prompt builder — two reference selfies of the SAME person,
//  one look at a time. We do NOT detect or assume gender; the
//  model conditions on the actual photos and fits the garment
//  to the person in frame.
//
//  Since the clean-headshot pivot (2026-07-04) every production
//  call passes { includeBird: false }: headshots render CLEAN and
//  the bird is composited client-side from its reference cutout.
//  birdLine() is kept for the legacy bird-on path (and any future
//  "AI-integrated bird" premium experiment).
// ============================================================

import { HUGE_BIRD_IDS } from "./birds.js";

// Most birds perch on the shoulder. Birds in HUGE_BIRD_IDS are rendered at
// TRUE scale standing behind the person, face in view over the shoulder —
// physically honest, occasionally very funny, both intentional.
function birdLine(bird) {
  if (HUGE_BIRD_IDS.has(bird.id)) {
    return `Add exactly one bird — ${bird.look} — at its TRUE real-world size. It is far too large to perch on a shoulder: it stands on the ground directly BEHIND the person, with its head and face clearly in view over the person's shoulder, looking toward the camera, in sharp photorealistic focus. Do NOT shrink the bird to fit; keep the real size contrast between bird and person. Always include the one bird; never add a second.`;
  }
  return `Add exactly one bird — ${bird.look} — perched naturally on the person's shoulder, in sharp photorealistic focus. Always include the one bird; never add a second.`;
}

// Both images are the same person (different angles), used together to lock
// likeness. The assigned bird is added by description (bird.look).
//
// includeBird (default true) keeps the brand-default bird in frame. Pass
// { includeBird: false } for the $10 "birdless" variant — it swaps the bird
// instruction for an explicit no-animal negative so nothing sneaks in.
// Edit prompt for bird REMOVAL (2026-07-15 bird-by-default pivot): takes a
// finished bird-in headshot and removes the bird, touching nothing else.
// Validated in the bake-off's debird track and spot-checked 2026-07-15 —
// removal is a far easier edit than addition (which is why the clean pivot's
// add-a-bird birdify looked off and was retired).
export const DEBIRD_PROMPT =
  "Remove the bird from this photograph completely. Change NOTHING else: keep the person's face, " +
  "expression, hair, outfit, pose, lighting, background, colour grade and framing EXACTLY as they are. " +
  "Fill the area where the bird was naturally and seamlessly. Photorealistic, high detail.";

// LEGACY — the retired /api/birdify add-a-bird path (2026-07-04 → 2026-07-15).
// Kept for reference/experiments only; no production caller.
export function buildBirdifyPrompt(bird) {
  const placement = HUGE_BIRD_IDS.has(bird.id)
    ? "at its TRUE real-world size, standing on the ground directly BEHIND the person, its head and neck clearly in view over the person's shoulder, looking toward the camera. Do NOT shrink the bird to fit; keep the real size contrast"
    : "perched naturally on the person's shoulder";
  return [
    "The first image is a finished professional headshot. The second image is a reference photo of the bird to add.",
    `Edit the FIRST image: add exactly one ${bird.name} — ${bird.look}, matching the reference bird's appearance exactly — ${placement}, in sharp photorealistic focus. Never add a second bird.`,
    "Photorealistic integration: match the scene's lighting, depth of field, and colour grading, with correct occlusion where the person overlaps the bird.",
    "Do NOT change the person in any way — same face, same expression, same hair, same clothing, same pose, same background, same framing and crop. The ONLY change is the added bird.",
  ].join(" ");
}

export function buildTwoPersonPrompt(look, bird, { includeBird = true } = {}) {
  return [
    "Create a completely new, original studio photograph of the SAME person shown in the reference photo(s) — painted from scratch, NOT assembled or composited from them.",
    "Do NOT cut out, crop, copy, or paste any pixels from the reference photo(s). Re-draw and re-light the ENTIRE image — including the face and head — as one seamless photograph: the face must take on the NEW studio lighting, not keep the lighting from the original photo(s). No collage, no pasted-on head, no mismatched edges or skin tone between head and body.",
    "Use the reference photo(s) only to capture identity — face shape, features, skin tone, eye colour, beard/facial hair, and hair (length and any baldness or thinning). It must be recognisably the same person, with the same gender and age; do not beautify or slim them.",
    // Bake-off T7 (2026-06-10): asking for "a natural, relaxed expression" made the
    // model INVENT expressions (smile<->no-smile switches), the top uncanny driver
    // (8/20 fails). Pinning expression to the reference took failures to 1/20.
    `Dress them in ${look.outfit}. Background: ${look.background}. Even, flattering studio lighting; keep the person's facial expression EXACTLY as in the reference photo — if they are smiling, the same smile; if not, do NOT add one. Never invent a new expression.`,
    // 2026-07-13: tightened crop — wider waist-up framings looked worse than the
    // close head-and-shoulders ones, so the crop is now pinned to mid-chest.
    "Composition: a square 1:1 CLOSE head-and-shoulders portrait — a tight crop where the head and face dominate the frame. The bottom edge of the frame falls at mid-chest, just below the collarbone area: no waist, no torso below the chest. The head (chin to top of hair) fills roughly half the frame height. Centre the head horizontally, with the eyes roughly one-third down from the top of the frame and only modest headroom above the hair. Use this EXACT tight framing in every image — do NOT zoom out, and do NOT inherit the crop, aspect ratio, or head position of the reference photo(s).",
    includeBird
      ? birdLine(bird)
      : "Do not include any bird, animal, or pet anywhere in the image — no bird on the shoulder and none in the background. The frame contains only the person.",
    "Photorealistic, high detail.",
  ].join(" ");
}
