// ============================================================
//  CALIBRATION HARNESS — step 1 of 3: GENERATE + SCORE
//
//  Builds the labelled dataset you need to tune SIM_THRESHOLD.
//  For each input face × each look × N samples it:
//    1. generates a render through the SAME pipeline as production
//       (lib/providers + lib/prompt), with the gate switched OFF so
//       nothing re-rolls — we want the raw, un-gated score distribution,
//    2. scores the render against the face with the SAME face-matcher
//       the gate uses (lib/similarity.js),
//    3. saves the render to disk and appends a row to manifest.json,
//    4. bakes a self-contained register.html you open and label in step 2.
//
//  Inputs are SYNTHETIC GAN faces (thispersondoesnotexist.com) by
//  default — no real person, no privacy/licence issue. Caveat: these
//  are single, clean, front-facing portraits, whereas production takes
//  TWO phone selfies. So absolute scores here run a little LOW vs
//  production; treat the threshold from this pass as a ballpark to
//  confirm on real jobs. What DOES transfer is the separation (AUC):
//  whether the score can tell good renders from uncanny ones at all.
//
//  COST: nothing runs until you pass --yes. The script prints a spend
//  estimate first and refuses to exceed --max-cost.
//
//  Usage:
//    node scripts/calibrate/gen.js                 # print plan + cost, do nothing
//    node scripts/calibrate/gen.js --yes           # 5 faces × 3 looks × 1 = 15 renders
//    node scripts/calibrate/gen.js --faces 8 --samples 2 --yes
//    node scripts/calibrate/gen.js --faces-dir ./my-selfies --yes
//
//  Flags:
//    --faces N        synthetic faces to fetch        (default 5)
//    --samples N      renders per face per look        (default 1)
//    --faces-dir DIR  use your own jpg/png faces instead of fetching
//    --out DIR        output dir   (default scripts/calibrate/out)
//    --provider NAME  replicate | gemini   (default = PROVIDER env or replicate)
//    --gen-cost N     $ per generated image           (default 0.08)
//    --match-cost N   $ per face-match call            (default 0.001)
//    --max-cost N     hard ceiling; abort if estimate exceeds it (default 10)
//    --yes            actually spend money and run
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Jimp from "jimp"; // v0.22 default export
import { LOOKS } from "../../lib/looks.js";
import { buildPrompt, buildTwoPersonPrompt } from "../../lib/prompt.js";
import { getProvider } from "../../lib/providers/index.js";
import * as kontextMulti from "../../lib/providers/kontext-multi.js";
import { faceSimilarity } from "../../lib/similarity.js";
import { getBird, BIRD_IDS } from "../../lib/birds.js";
import { buildRegister } from "./register-template.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- args ----------
function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true; // bare flag → true
}
const FACES = Number(arg("faces", 5));
const SAMPLES = Number(arg("samples", 1));
const FACES_DIR = arg("faces-dir", null);
const OUT = path.resolve(arg("out", path.join(__dirname, "out")));
const PROVIDER = (arg("provider", process.env.PROVIDER || "replicate")).toLowerCase();
const GEN_COST = Number(arg("gen-cost", 0.08));
const MATCH_COST = Number(arg("match-cost", 0.001));
const MAX_COST = Number(arg("max-cost", 10));
const GO = !!arg("yes", false);

if (PROVIDER) process.env.PROVIDER = PROVIDER;

// ---------- helpers ----------
const RENDERS_DIR = path.join(OUT, "renders");
const FACES_OUT = path.join(OUT, "faces");

function ensureDirs() {
  for (const d of [OUT, RENDERS_DIR, FACES_OUT]) fs.mkdirSync(d, { recursive: true });
}

// thispersondoesnotexist serves a fresh 1024² GAN face per GET.
async function fetchSyntheticFace(i) {
  const res = await fetch("https://thispersondoesnotexist.com/", {
    headers: { "User-Agent": "Mozilla/5.0 (calibration-harness)" },
  });
  if (!res.ok) throw new Error(`face fetch ${i} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5000) throw new Error(`face fetch ${i} → suspiciously small (${buf.length}b)`);
  return buf;
}

const readImg = (p) => ({
  buffer: fs.readFileSync(p),
  mimeType: /\.png$/i.test(p) ? "image/png" : "image/jpeg",
});

// An "identity" = { name, photos:[{buffer,mimeType}, ...] }. Up to 2 photos used
// (production fuses two angles for likeness; the gate scores against photos[0]).
//
// --faces-dir layout, two ways:
//   • SUBFOLDER PER PERSON  (best — enables 2-photo mode):
//       faces/alice/1.jpg  faces/alice/2.jpg   → alice, 2 photos
//       faces/bob/front.jpg                     → bob, 1 photo
//   • FLAT FILES (each file = its own 1-photo identity):
//       faces/alice.jpg  faces/bob.png
//     …unless filenames share a stem before _1/_2/-a/-b, which get paired:
//       faces/alice_1.jpg faces/alice_2.jpg     → alice, 2 photos
function loadIdentities(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const subdirs = entries.filter((e) => e.isDirectory());
  if (subdirs.length) {
    const ids = subdirs
      .map((d) => {
        const imgs = fs
          .readdirSync(path.join(dir, d.name))
          .filter((f) => /\.(jpe?g|png)$/i.test(f))
          .sort()
          .slice(0, 2)
          .map((f) => readImg(path.join(dir, d.name, f)));
        return { name: d.name, photos: imgs };
      })
      .filter((id) => id.photos.length);
    if (!ids.length) throw new Error(`no images inside the subfolders of ${dir}`);
    return ids;
  }
  // flat files → group by stem (strip trailing _1/_2/-a/-b/ -1/-2)
  const files = entries
    .filter((e) => e.isFile() && /\.(jpe?g|png)$/i.test(e.name))
    .map((e) => e.name)
    .sort();
  if (!files.length) throw new Error(`no .jpg/.png files (or subfolders) in ${dir}`);
  const groups = new Map();
  for (const f of files) {
    const stem = f.replace(/\.[^.]+$/, "").replace(/[ _-]?(?:[12]|[ab])$/i, "");
    if (!groups.has(stem)) groups.set(stem, []);
    groups.get(stem).push(readImg(path.join(dir, f)));
  }
  return [...groups.entries()].map(([name, photos]) => ({ name, photos: photos.slice(0, 2) }));
}

async function gatherIdentities() {
  if (FACES_DIR) {
    const ids = loadIdentities(path.resolve(FACES_DIR));
    const multi = ids.filter((i) => i.photos.length >= 2).length;
    console.log(`Using ${ids.length} identit${ids.length === 1 ? "y" : "ies"} from ${FACES_DIR} (${multi} with 2 photos, ${ids.length - multi} with 1)`);
    return ids;
  }
  console.log(`Fetching ${FACES} synthetic faces…`);
  const ids = [];
  for (let i = 0; i < FACES; i++) {
    try {
      const buffer = await fetchSyntheticFace(i);
      const name = `synthetic-${String(i + 1).padStart(2, "0")}`;
      fs.writeFileSync(path.join(FACES_OUT, `${name}.jpg`), buffer);
      ids.push({ name, photos: [{ buffer, mimeType: "image/jpeg" }] });
      process.stdout.write(`  ✓ ${name}\n`);
      await sleep(1200); // be polite to the source
    } catch (e) {
      console.warn(`  ✗ ${e.message} — skipping`);
    }
  }
  if (!ids.length)
    throw new Error("Couldn't fetch any synthetic faces. Drop your own jpg/png files in a folder and pass --faces-dir DIR.");
  return ids;
}

const dataUri = (f) => `data:${f.mimeType};base64,${f.buffer.toString("base64")}`;

// 512px JPEG thumbnail as base64 — keeps register.html small enough to open.
// Accepts a Buffer, file path, or http URL.
async function thumb(input) {
  try {
    const img = await Jimp.read(input);          // Buffer | path | URL all supported in 0.22
    img.scaleToFit(512, 512);                     // preserve aspect, cap longest side at 512
    img.quality(82);
    return await img.getBase64Async(Jimp.MIME_JPEG);
  } catch (e) {
    console.warn(`  thumb failed (${e.message}); inlining original`);
    if (Buffer.isBuffer(input)) return `data:image/jpeg;base64,${input.toString("base64")}`;
    const r = await fetch(input);
    return `data:image/jpeg;base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  }
}

async function bufferFromSrc(src) {
  if (src.startsWith("data:")) return Buffer.from(src.split(",")[1], "base64");
  const r = await fetch(src);
  return Buffer.from(await r.arrayBuffer());
}

// ---------- main ----------
async function main() {
  if (!process.env.REPLICATE_API_TOKEN) {
    console.error("REPLICATE_API_TOKEN is not set (.env). The gate's scorer and Flux both need it.");
    process.exit(1);
  }

  const plannedFaces = FACES_DIR ? loadIdentities(path.resolve(FACES_DIR)).length : FACES;
  const renders = plannedFaces * LOOKS.length * SAMPLES;
  const estimate = renders * (GEN_COST + MATCH_COST);

  console.log("\n──────── calibration plan ────────");
  console.log(`  provider     ${PROVIDER}`);
  console.log(`  faces        ${plannedFaces}${FACES_DIR ? ` (from ${FACES_DIR})` : " (synthetic)"}`);
  console.log(`  looks        ${LOOKS.length} (${LOOKS.map((l) => l.id).join(", ")})`);
  console.log(`  samples/look ${SAMPLES}`);
  console.log(`  renders      ${renders}`);
  console.log(`  est. cost    ~$${estimate.toFixed(2)}  (${renders}×($${GEN_COST}+$${MATCH_COST}))`);
  console.log(`  out          ${OUT}`);
  console.log("──────────────────────────────────\n");

  if (estimate > MAX_COST) {
    console.error(`Estimate $${estimate.toFixed(2)} exceeds --max-cost $${MAX_COST}. Lower --faces/--samples or raise --max-cost.`);
    process.exit(1);
  }
  if (!GO) {
    console.log("Dry run. Re-run with --yes to spend the above and generate.\n");
    return;
  }

  ensureDirs();
  const identities = await gatherIdentities();
  const provider = getProvider();
  const rows = [];
  let n = 0;
  const t0 = Date.now();

  for (const id of identities) {
    const selfie = id.photos[0];                 // gate scores renders against the first photo
    const twoPerson = id.photos.length >= 2;     // mirror production: fuse two angles when available
    const mode = twoPerson ? "2-photo" : "1-photo";
    const selfieUri = dataUri(selfie);
    const selfieThumb = await thumb(selfie.buffer);
    // keep a copy of the reference selfie on disk for the record
    fs.writeFileSync(path.join(FACES_OUT, `${id.name}.jpg`), selfie.buffer);
    for (const look of LOOKS) {
      for (let s = 0; s < SAMPLES; s++) {
        n++;
        const bird = getBird(BIRD_IDS[Math.floor(Math.random() * BIRD_IDS.length)]);
        const tag = `${id.name}/${look.id}/${s} (${mode})`;
        try {
          let src;
          if (twoPerson) {
            if (PROVIDER === "gemini") {
              ({ src } = await provider.generate({ images: id.photos, prompt: buildTwoPersonPrompt(look, bird) }));
            } else {
              ({ src } = await kontextMulti.generateMulti({ imageA: id.photos[0], imageB: id.photos[1], prompt: buildTwoPersonPrompt(look, bird) }));
            }
          } else {
            ({ src } = await provider.generate({ images: [selfie], prompt: buildPrompt(look, bird) }));
          }
          const sim = await faceSimilarity(selfieUri, src);
          let score = sim?.score ?? null;
          if (sim && sim.faces2 === 0) score = 0; // no face in output → definitely bad
          const buf = await bufferFromSrc(src);
          const file = `${id.name}_${look.id}_${s}.jpg`;
          fs.writeFileSync(path.join(RENDERS_DIR, file), buf);
          const renderThumb = await thumb(buf);
          rows.push({
            id: `${id.name}_${look.id}_${s}`,
            face: id.name,
            look: look.id,
            lookLabel: look.label,
            sample: s,
            mode,
            bird: bird.id,
            score,
            faces1: sim?.faces1 ?? null,
            faces2: sim?.faces2 ?? null,
            renderFile: `renders/${file}`,
            faceFile: `faces/${id.name}.jpg`,
            selfieThumb,
            renderThumb,
          });
          console.log(`[${n}/${renders}] ${tag}  score ${score == null ? "n/a" : score.toFixed(3)} (faces ${sim?.faces1 ?? "?"}/${sim?.faces2 ?? "?"})`);
        } catch (e) {
          console.warn(`[${n}/${renders}] ${tag}  FAILED: ${e.message}`);
          rows.push({ id: tag, face: id.name, look: look.id, sample: s, mode, score: null, error: e.message });
        }
      }
    }
  }

  // manifest.json — full record for fit.js / audit (thumbs stripped to keep it readable)
  const manifest = {
    createdAt: new Date().toISOString(),
    provider: PROVIDER,
    genCost: GEN_COST,
    matchCost: MATCH_COST,
    rows: rows.map(({ selfieThumb, renderThumb, ...r }) => r),
  };
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));

  // register.html — self-contained labelling UI with thumbnails inlined
  const labelRows = rows
    .filter((r) => !r.error && r.score != null)
    .map((r) => ({ id: r.id, face: r.face, look: r.look, lookLabel: r.lookLabel, score: r.score, selfie: r.selfieThumb, render: r.renderThumb }));
  const html = buildRegister(labelRows, { provider: PROVIDER });
  fs.writeFileSync(path.join(OUT, "register.html"), html);

  const scored = rows.filter((r) => r.score != null).length;
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\nDone in ${mins} min. ${scored}/${rows.length} scored.`);
  console.log(`  manifest : ${path.join(OUT, "manifest.json")}`);
  console.log(`  register : ${path.join(OUT, "register.html")}  ← open this and label`);
  console.log(`\nNext: open register.html, label each render Keep / Uncanny, read the threshold it recommends.`);
}

main().catch((e) => {
  console.error("\nFATAL:", e.message);
  process.exit(1);
});
