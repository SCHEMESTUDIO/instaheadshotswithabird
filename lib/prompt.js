// ============================================================
//  Prompt builder — single input photo, one look at a time.
//  Outfit varies per look; we do NOT detect or assume gender —
//  the editor conditions on the actual photo and fits the
//  garment to the person in frame.
//
//  The bird is injected here, server-side, on every call.
//  There is no client control to remove it.
// ============================================================

export function buildPrompt(look, bird) {
  return [
    "Using the provided reference photo, create a polished professional headshot of the SAME person.",
    "Preserve their face, identity, bone structure, hair, skin tone and likeness exactly — it must clearly be the same individual.",
    `Outfit: dress them in ${look.outfit}. Fit the outfit naturally to the person in the photo.`,
    `Background: ${look.background}.`,
    `ABSOLUTE NON-NEGOTIABLE REQUIREMENT: exactly ONE ${bird.look} is perched naturally and clearly on the person's shoulder,`,
    "in sharp photorealistic focus, sized and lit so it looks like it genuinely belongs in the photo.",
    "Always include the bird. Never omit it. Never add a second bird.",
    "Photorealistic, high detail, flattering studio-quality lighting, sharp focus.",
  ].join(" ");
}
