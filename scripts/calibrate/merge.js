// ============================================================
//  MERGE — combine several gen.js batches into one register.
//
//  gen.js overwrites its --out folder each run, so to pool multiple
//  batches (e.g. real people + synthetic) you point each run at its
//  own --out, then merge the manifests here. Render/selfie images are
//  re-thumbnailed from disk; row ids are namespaced per source so
//  nothing collides.
//
//  Usage (paths are manifest.json files; --out is the combined dir):
//    node scripts/calibrate/merge.js \
//      scripts/calibrate/out/manifest.json \
//      scripts/calibrate/out/manifest.synth1.json \
//      scripts/calibrate/out-synth2/manifest.json \
//      --out scripts/calibrate/out-combined
//
//  Writes out-combined/{manifest.json, register.html}. Open the
//  register to label all of them together; fit.js works on the
//  combined manifest too.
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Jimp from "jimp";
import { buildRegister } from "./register-template.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const outIdx = argv.indexOf("--out");
const OUT = path.resolve(outIdx === -1 ? path.join(__dirname, "out-combined") : argv[outIdx + 1]);
const manifests = argv.filter((a, i) => !a.startsWith("--") && i !== (outIdx === -1 ? -1 : outIdx + 1));

if (!manifests.length) {
  console.error("Pass one or more manifest.json paths. See header for usage.");
  process.exit(1);
}

async function thumb(file) {
  try {
    const img = await Jimp.read(file);
    img.scaleToFit(512, 512);
    img.quality(82);
    return await img.getBase64Async(Jimp.MIME_JPEG);
  } catch (e) {
    console.warn(`  thumb failed for ${file}: ${e.message}`);
    return null;
  }
}

// short unique tag per source dir, for namespacing ids
function tagFor(manifestPath, used) {
  let t = path.basename(path.dirname(path.resolve(manifestPath))).replace(/[^a-z0-9]+/gi, "").slice(0, 8) || "b";
  if (path.basename(manifestPath) !== "manifest.json") t += "_" + path.basename(manifestPath).replace(/\.json$/, "").replace(/[^a-z0-9]+/gi, "");
  let u = t, k = 2;
  while (used.has(u)) u = t + k++;
  used.add(u);
  return u;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const labelRows = [];
  const mergedRows = [];
  const usedTags = new Set();
  let genCost = 0.08;

  for (const mp of manifests) {
    const abs = path.resolve(mp);
    const baseDir = path.dirname(abs);
    let m;
    try { m = JSON.parse(fs.readFileSync(abs, "utf8")); }
    catch { console.error(`Skipping unreadable manifest: ${abs}`); continue; }
    if (m.genCost) genCost = m.genCost;
    const tag = tagFor(mp, usedTags);
    let added = 0, skipped = 0;
    for (const r of m.rows) {
      if (r.error || r.score == null) { skipped++; continue; }
      const renderPath = path.join(baseDir, r.renderFile || "");
      const facePath = r.faceFile ? path.join(baseDir, r.faceFile) : null;
      if (!fs.existsSync(renderPath) || (facePath && !fs.existsSync(facePath))) { skipped++; continue; }
      const render = await thumb(renderPath);
      const selfie = facePath ? await thumb(facePath) : null;
      if (!render || !selfie) { skipped++; continue; }
      const id = `${tag}:${r.id}`;
      labelRows.push({ id, face: `${tag}:${r.face}`, look: r.look, lookLabel: r.lookLabel, score: r.score, selfie, render });
      mergedRows.push({ id, face: `${tag}:${r.face}`, look: r.look, lookLabel: r.lookLabel, score: r.score, mode: r.mode, source: tag });
      added++;
    }
    console.log(`  ${tag}  ←  ${mp}   (+${added} cards, ${skipped} skipped)`);
  }

  if (!labelRows.length) { console.error("Nothing to merge — no scored rows with images found."); process.exit(1); }

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ createdAt: new Date().toISOString(), merged: manifests, genCost, rows: mergedRows }, null, 2));
  fs.writeFileSync(path.join(OUT, "register.html"), buildRegister(labelRows, { provider: "merged", genCost }));

  const people = new Set(labelRows.map((r) => r.face)).size;
  console.log(`\nMerged ${labelRows.length} renders from ${people} identities across ${manifests.length} batch(es).`);
  console.log(`  register : ${path.join(OUT, "register.html")}  ← open this and label`);
  console.log(`  manifest : ${path.join(OUT, "manifest.json")}  (for fit.js)`);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
