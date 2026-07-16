// One-off QA run (2026-07-16): the 3 NEW female-set looks, 3 images each,
// through the real production prompt path (buildTwoPersonPrompt, birdless to
// isolate garment quality). Duplicates from the male set (black tee, black
// turtleneck) are skipped — already validated in prod.
// Refs: 2× source-selfie.jpg (woman A), 1× source-selfie-2.jpg (woman B).
// Usage: node scripts/test-female-looks.mjs
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { buildTwoPersonPrompt } from "../lib/prompt.js";
import { generate } from "../lib/providers/gemini.js";

const OUT = path.resolve("scripts/test-female-looks-out");
fs.mkdirSync(OUT, { recursive: true });

// Backdrops mirror the male-set slot each look replaces (backdrop parity).
const NEW_FEMALE_LOOKS = [
  {
    id: "black-jacket-ruffled-tee", label: "Black Jacket + Ruffled Tee",
    outfit: "a tailored black professional jacket worn over a white tee with a delicate ruffled neckline",
    background: "a softly blurred modern open-plan office with warm natural light",
  },
  {
    // v2 2026-07-16: backdrop swapped with grey dress — blouse now on studio grey.
    id: "navy-blouse-v2", label: "Navy Blouse",
    outfit: "a modern navy blouse with a clean, contemporary cut",
    background: "a clean soft neutral grey studio backdrop",
  },
  {
    // v2 pinned 2026-07-16: James picked run a2 — the wide white contrast band
    // around a notched neckline. v1's looser "white detailing" invented a
    // different collar every run (incl. a school-uniform Peter Pan collar).
    // Backdrop swapped with navy blouse 2026-07-16: dress goes outside.
    id: "grey-dress-v2", label: "Grey Dress",
    outfit: "an elegant heather-grey dress with a split-neck (notched) neckline framed by a wide, crisp white contrast band — no other white elements, no collar, no straps or piping",
    background: "a softly blurred park in warm, even golden-hour light with gentle green-and-amber bokeh",
  },
  // Aviary female swaps (2026-07-16): only these two are NEW garment types —
  // the burgundy plain-crewneck swap reuses a validated pattern.
  {
    // v1 (boardroom backdrop) drove expression drift: 3/4 woman-A renders
    // invented or dropped the smile. Studio diag held the expression, so the
    // boardroom scene is implicated → v2 moves to the corner office.
    id: "charcoal-blazer-shell-v2", label: "Charcoal Blazer",
    outfit: "a tailored charcoal blazer over a white silk shell top",
    background: "a softly blurred corner office with floor-to-ceiling windows and daylight",
  },
  {
    // DIAGNOSTIC (not a product look): blazer garment × studio backdrop, to
    // isolate whether the boardroom scene drives the expression drift seen
    // on charcoal-blazer-shell (3/4 woman-A renders invented/changed smiles).
    id: "charcoal-blazer-shell-studio", label: "Charcoal Blazer (studio diag)",
    outfit: "a tailored charcoal blazer over a white silk shell top",
    background: "a clean soft neutral grey studio backdrop",
  },
  {
    id: "forest-wrap", label: "Forest Wrap Top",
    outfit: "a forest-green wrap-style top with a soft V neckline",
    background: "a softly blurred wall of lush green foliage in gentle natural light",
  },
];

function loadRef(p) {
  return { buffer: fs.readFileSync(p), mimeType: "image/jpeg" };
}
const womanA = loadRef("public/examples/source-selfie.jpg");
const womanB = loadRef("public/examples/source-selfie-2.jpg");

// 3 runs per look: 2× woman A, 1× woman B
const RUNS = [
  { tag: "a1", images: [womanA] },
  { tag: "a2", images: [womanA] },
  { tag: "b1", images: [womanB] },
];

function saveDataUri(src, name) {
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(src);
  if (!m) throw new Error("unexpected src format");
  const ext = m[1] === "image/png" ? "png" : "jpg";
  const p = path.join(OUT, `${name}.${ext}`);
  fs.writeFileSync(p, Buffer.from(m[2], "base64"));
  console.log("wrote", p);
}

// Resumable: skips outputs that already exist. Pass --one to generate just
// the next missing image and exit (lets a supervisor drive it in short calls).
// ONLY=<look-id> TAG=<run-tag> narrows a run (e.g. an extra re-roll of one look).
const ONE = process.argv.includes("--one");
const ONLY = process.env.ONLY || null;
const EXTRA_TAG = process.env.TAG || null;
if (EXTRA_TAG) RUNS.push({ tag: EXTRA_TAG, images: [womanA] });

const main = async () => {
  for (const look of NEW_FEMALE_LOOKS) {
    if (ONLY && look.id !== ONLY) continue;
    const prompt = buildTwoPersonPrompt(look, null, { includeBird: false });
    for (const run of RUNS) {
      const name = `${look.id}-${run.tag}`;
      if (fs.existsSync(path.join(OUT, `${name}.jpg`)) || fs.existsSync(path.join(OUT, `${name}.png`))) continue;
      console.log("generating", name);
      for (let attempt = 1; ; attempt++) {
        try {
          const { src } = await generate({ images: run.images, prompt });
          saveDataUri(src, name);
          if (ONE) return console.log("one done, exiting.");
          break;
        } catch (e) {
          if (attempt >= 3) { console.error("FAILED", name, e.message); break; }
          const wait = e.retryAfterMs || 8000;
          console.log(`  retry ${attempt} after ${wait}ms — ${e.message}`);
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    }
  }
  console.log("done.");
};
main().catch((e) => { console.error(e); process.exit(1); });
