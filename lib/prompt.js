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
    "IMAGE 1 and IMAGE 2 are two reference photos of the SAME person, provided only so you can learn their likeness.",
    "Generate a brand-new professional studio headshot of this person. Do NOT copy, crop, or reproduce either reference photo, and do NOT keep their original clothing, pose, or background.",
    "Keep their facial identity clearly recognizable — the same face, eye colour, skin tone, and general hairstyle, so it is obviously the same person. This should look like a fresh photo taken on a different day, not a retouch of the originals; natural variation is welcome.",
    `Style the new headshot: dress them in ${look.outfit}; set the background to ${look.background}; frame it as a flattering head-and-shoulders professional portrait with studio-quality lighting.`,
    `Add exactly ONE ${bird.look} perched naturally on the person's shoulder, in sharp photorealistic focus. Always include the one bird; never add a second.`,
    "Photorealistic, high detail.",
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
