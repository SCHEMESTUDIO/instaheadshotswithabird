// ============================================================
//  Prompt builder — two reference selfies of the SAME person,
//  one look at a time. We do NOT detect or assume gender; the
//  model conditions on the actual photos and fits the garment
//  to the person in frame.
//
//  The assigned bird is described here, in the text prompt, on
//  every call. There is no client control to remove it.
// ============================================================

// Both images are the same person (different angles), used together to lock
// likeness. The assigned bird is added by description (bird.look).
export function buildTwoPersonPrompt(look, bird) {
  return [
    "Create a completely new, original studio photograph of the SAME person shown in the reference photo(s) — painted from scratch, NOT assembled or composited from them.",
    "Do NOT cut out, crop, copy, or paste any pixels from the reference photo(s). Re-draw and re-light the ENTIRE image — including the face and head — as one seamless photograph: the face must take on the NEW studio lighting, not keep the lighting from the original photo(s). No collage, no pasted-on head, no mismatched edges or skin tone between head and body.",
    "Use the reference photo(s) only to capture identity — face shape, features, skin tone, eye colour, beard/facial hair, and hair (length and any baldness or thinning). It must be recognisably the same person, with the same gender and age; do not beautify or slim them.",
    `Dress them in ${look.outfit}. Background: ${look.background}. Even, flattering studio lighting; a natural, relaxed expression.`,
    "Composition: a square 1:1 head-and-shoulders portrait. Centre the head horizontally, with the eyes roughly one-third down from the top of the frame and even headroom above the hair. Use this EXACT framing in every image — do NOT inherit the crop, aspect ratio, or head position of the reference photo(s).",
    `Add exactly one bird — ${bird.look} — perched naturally on the person's shoulder, in sharp photorealistic focus. Always include the one bird; never add a second.`,
    "Photorealistic, high detail.",
  ].join(" ");
}
