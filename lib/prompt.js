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
    "Edit this photograph of a person into a professional headshot.",
    "CRITICAL — preserve identity: keep the person's face, head shape, skin tone, eyes, nose, mouth, expression, hairstyle, hair length and colour, and facial hair EXACTLY as in the original photo.",
    "Do not change their identity, age, weight, or any facial proportions. The result must be unmistakably the same person. Do NOT lengthen, shorten, or restyle their hair.",
    `Change ONLY these three things: (1) dress them in ${look.outfit}, fitted naturally; (2) replace the background with ${look.background}; (3) add exactly ONE ${bird.look} perched naturally on the person's shoulder, in sharp photorealistic focus so it looks like it belongs in the photo.`,
    "Never add a second bird; always include the one bird. Keep it a natural head-and-shoulders portrait. Photorealistic, high detail, flattering professional lighting.",
  ].join(" ");
}
