// ============================================================
//  Prompt builder — single input photo, one look at a time.
//  Outfit varies per look; we do NOT detect or assume gender —
//  the editor conditions on the actual photo and fits the
//  garment to the person in frame.
//
//  The bird is injected here, server-side, on every call.
//  There is no client control to remove it.
// ============================================================

// Two-photo version: BOTH images are the same person (different angles),
// used together to lock likeness. Bird is added via text.
export function buildTwoPersonPrompt(look, bird) {
  return [
    "IMAGE 1 and IMAGE 2 are two photos of the SAME person, from slightly different angles or moments.",
    "Create ONE professional headshot of this exact person, using BOTH images together to capture their true likeness.",
    "CRITICAL — their face, head shape, skin tone, eyes, nose, mouth, expression, hairstyle, hair length and colour, and facial hair must match them exactly; it must be unmistakably the same person. Do not blend in anyone else and do not restyle their hair.",
    `Dress them in ${look.outfit}, fitted naturally. Set the background to ${look.background}.`,
    `Add exactly ONE ${bird.look} perched naturally on the person's shoulder, in sharp photorealistic focus. Always include the one bird; never add a second.`,
    "Photorealistic, high detail, flattering professional lighting, natural head-and-shoulders portrait.",
  ].join(" ");
}

// Multi-image version: image 1 = person, image 2 = the bird reference.
// The bird's appearance is defined by image 2, so we don't describe it in text.
export function buildMultiPrompt(look) {
  return [
    "You are given two images. IMAGE 1 is a photo of a person. IMAGE 2 is a photo of a bird.",
    "Create a professional headshot of the PERSON from image 1.",
    "CRITICAL — keep the person's face, head shape, skin tone, eyes, nose, mouth, expression, hairstyle, hair length and colour, and facial hair EXACTLY as in image 1. It must be unmistakably the same person. Do not lengthen, shorten, or restyle their hair.",
    `Change only: dress them in ${look.outfit}, fitted naturally; and set the background to ${look.background}.`,
    "Place the bird from IMAGE 2 perched naturally on the person's shoulder, matching that bird's exact species, colours, markings and size. Include exactly ONE bird; always include it; do not add a second bird.",
    "Photorealistic, high detail, flattering professional lighting, natural head-and-shoulders portrait.",
  ].join(" ");
}

export function buildPrompt(look, bird) {
  return [
    "Edit this photograph of a person into a professional headshot.",
    "CRITICAL — preserve identity: keep the person's face, head shape, skin tone, eyes, nose, mouth, expression, hairstyle, hair length and colour, and facial hair EXACTLY as in the original photo.",
    "Do not change their identity, age, weight, or any facial proportions. The result must be unmistakably the same person. Do NOT lengthen, shorten, or restyle their hair.",
    `Change ONLY these three things: (1) dress them in ${look.outfit}, fitted naturally; (2) replace the background with ${look.background}; (3) add exactly ONE ${bird.look} perched naturally on the person's shoulder, in sharp photorealistic focus so it looks like it belongs in the photo.`,
    "Never add a second bird; always include the one bird. Keep it a natural head-and-shoulders portrait. Photorealistic, high detail, flattering professional lighting.",
  ].join(" ");
}
