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
    "Take a brand-new professional studio photograph of the SAME person shown in the two reference photos.",
    "Use the two references ONLY to learn their identity — face shape, features, skin tone, eye colour, beard/facial hair, and hair (including length and any baldness or thinning). The result must be recognisably the same person, with the same gender and age; do not beautify or slim them.",
    "Render the ENTIRE image fresh as one coherent photograph. Do NOT cut out, crop, copy, or paste any pixels from the reference photos — the head, neck, and body must share the same lighting, colour, focus, skin texture, and grain, with no pasted-on or collage look.",
    `Dress them in ${look.outfit}. Background: ${look.background}. Even, flattering studio lighting; a natural, relaxed expression; head-and-shoulders framing.`,
    `Add exactly one bird — ${bird.look} — perched naturally on the person's shoulder, in sharp photorealistic focus. Always include the one bird; never add a second.`,
    "Photorealistic, high detail.",
  ].join(" ");
}
