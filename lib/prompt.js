// ============================================================
//  Prompt builder — two reference selfies of the SAME person,
//  one look at a time. We do NOT detect or assume gender; the
//  model conditions on the actual photos and fits the garment
//  to the person in frame.
//
//  The assigned bird is described here, in the text prompt, on
//  every call. There is no client control to remove it.
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
export function buildTwoPersonPrompt(look, bird, { includeBird = true } = {}) {
  return [
    "Create a completely new, original studio photograph of the SAME person shown in the reference photo(s) — painted from scratch, NOT assembled or composited from them.",
    "Do NOT cut out, crop, copy, or paste any pixels from the reference photo(s). Re-draw and re-light the ENTIRE image — including the face and head — as one seamless photograph: the face must take on the NEW studio lighting, not keep the lighting from the original photo(s). No collage, no pasted-on head, no mismatched edges or skin tone between head and body.",
    "Use the reference photo(s) only to capture identity — face shape, features, skin tone, eye colour, beard/facial hair, and hair (length and any baldness or thinning). It must be recognisably the same person, with the same gender and age; do not beautify or slim them.",
    // Bake-off T7 (2026-06-10): asking for "a natural, relaxed expression" made the
    // model INVENT expressions (smile<->no-smile switches), the top uncanny driver
    // (8/20 fails). Pinning expression to the reference took failures to 1/20.
    `Dress them in ${look.outfit}. Background: ${look.background}. Even, flattering studio lighting; keep the person's facial expression EXACTLY as in the reference photo — if they are smiling, the same smile; if not, do NOT add one. Never invent a new expression.`,
    "Composition: a square 1:1 head-and-shoulders portrait. Centre the head horizontally, with the eyes roughly one-third down from the top of the frame and even headroom above the hair. Use this EXACT framing in every image — do NOT inherit the crop, aspect ratio, or head position of the reference photo(s).",
    includeBird
      ? birdLine(bird)
      : "Do not include any bird, animal, or pet anywhere in the image — no bird on the shoulder and none in the background. The frame contains only the person.",
    "Photorealistic, high detail.",
  ].join(" ");
}
