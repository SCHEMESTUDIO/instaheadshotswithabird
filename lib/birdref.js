// ============================================================
//  Bird reference images — the canonical, verified picture of
//  each species. Generated ONCE (scripts/gen-bird-refs.js),
//  reviewed by eye, then fed into generation so the same bird
//  appears in every headshot AND matches the Bird ID card.
//
//  Sexually dimorphic species are pinned to their iconic form
//  (usually the colourful male) so the reference matches what
//  people picture.
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REF_DIR = path.join(__dirname, "..", "public", "birds");

export function refPath(id) { return path.join(REF_DIR, `${id}.jpg`); }
export function refPublicUrl(id) { return `/birds/${id}.jpg`; }
export function hasRef(id) { try { return fs.existsSync(refPath(id)); } catch { return false; } }

// ---- transparent cutouts (2026-07-04, the "clean headshots" pivot) ----
// Generation is now birdless; the bird is COMPOSITED client-side onto the
// user's picked headshot (Bird ID card + the "you + your bird" download).
// Cutouts are built once by scripts/gen-bird-cutouts.js + make-cutouts.py
// and committed to the repo, so they survive ephemeral hosting.
export const CUTOUT_DIR = path.join(REF_DIR, "cutouts");
export function cutoutPath(id) { return path.join(CUTOUT_DIR, `${id}.png`); }
export function cutoutPublicUrl(id) { return `/birds/cutouts/${id}.png`; }
export function hasCutout(id) { try { return fs.existsSync(cutoutPath(id)); } catch { return false; } }

// Iconic form for sexually dimorphic species (the look people picture).
// Add an id here to pin its plumage/sex in the reference + headshots.
const FORM = {
  "mallard": "adult male drake, glossy iridescent green head, white neck-ring, chestnut breast",
  "mandarin-duck": "adult male in full breeding plumage with orange sail-feathers and purple chest",
  "wood-duck": "adult male in breeding plumage, iridescent green crested head and red eyes",
  "northern-cardinal": "adult male, brilliant all-over red plumage and black face mask",
  "indian-peafowl": "adult male peacock, iridescent blue neck and full eye-spotted train",
  "superb-fairywren": "adult breeding male, electric-blue crown and cheeks with black collar",
  "splendid-fairywren": "adult breeding male, brilliant iridescent all-over blue",
  "eurasian-bullfinch": "adult male, rosy-red breast, black cap, grey back",
  "painted-bunting": "adult male, blue head, red underparts and green back",
  "baltimore-oriole": "adult male, vivid orange-and-black",
  "red-winged-blackbird": "adult male, glossy black with red-and-yellow shoulder patches",
  "gouldian-finch": "adult male, vivid multicolour body with a black face",
  "ruby-throated-hummingbird": "adult male, iridescent ruby-red throat (gorget)",
  "rufous-hummingbird": "adult male, bright copper-orange with iridescent red-orange throat",
  "annas-hummingbird": "adult male, iridescent magenta crown and throat",
  "crimson-sunbird": "adult male, glittering crimson breast and back",
  "common-cuckoo": "adult grey morph",
  "common-pheasant": "adult male (cock), coppery body and iridescent green head",
};

export function birdForm(bird) {
  return bird.form || FORM[bird.id] || "in its most iconic, recognizable adult plumage (for sexually dimorphic species, the colourful male)";
}

// Text-to-image prompt for generating the canonical reference photo.
export function buildRefPrompt(bird) {
  return [
    `A professional wildlife photograph of a single ${bird.name} (${bird.sci}),`,
    `${birdForm(bird)}.`,
    `${bird.look}.`,
    "The whole bird perched in profile, sharp focus, accurate natural colours and markings, even soft lighting,",
    "plain neutral light-grey studio background, centered, full body visible, no text, no watermark, no other animals.",
  ].join(" ");
}
