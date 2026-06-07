// ============================================================
//  Generate canonical bird reference photos (run once, locally).
//
//  Usage:
//    node scripts/gen-bird-refs.js                 # all birds (skips existing)
//    node scripts/gen-bird-refs.js rock-pigeon ...  # only these ids
//    node scripts/gen-bird-refs.js --force ...      # regenerate even if present
//
//  Needs REPLICATE_API_TOKEN in .env. Saves JPGs to public/birds/.
//  Start with a handful, eyeball them, THEN do the full batch.
// ============================================================

import "dotenv/config";
import fs from "fs";
import { BIRDS, getBird } from "../lib/birds.js";
import { REF_DIR, refPath, buildRefPrompt } from "../lib/birdref.js";

const MODEL = process.env.REF_MODEL || "black-forest-labs/flux-1.1-pro";
const token = process.env.REPLICATE_API_TOKEN;
if (!token) { console.error("✗ Set REPLICATE_API_TOKEN in .env"); process.exit(1); }
fs.mkdirSync(REF_DIR, { recursive: true });

const args = process.argv.slice(2);
const force = args.includes("--force");
const ids = args.filter((a) => !a.startsWith("--"));
const targets = ids.length ? ids.map(getBird).filter(Boolean) : BIRDS;
if (ids.length && targets.length !== ids.length) {
  console.warn("⚠ some ids not found:", ids.filter((i) => !getBird(i)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function genOne(bird) {
  const out = refPath(bird.id);
  if (fs.existsSync(out) && !force) { console.log("· skip (exists):", bird.id); return; }

  const res = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "wait" },
    body: JSON.stringify({ input: { prompt: buildRefPrompt(bird), aspect_ratio: "1:1", output_format: "jpg", safety_tolerance: 2 } }),
  });
  let p = await res.json();
  if (!res.ok) throw new Error(p.detail || p.error || res.statusText);
  while (p.status && p.status !== "succeeded" && p.status !== "failed" && p.urls?.get) {
    await sleep(1500);
    p = await (await fetch(p.urls.get, { headers: { Authorization: `Bearer ${token}` } })).json();
  }
  if (p.status === "failed" || p.error) throw new Error(p.error || "generation failed");
  const url = Array.isArray(p.output) ? p.output[0] : p.output;
  if (!url) throw new Error("no image returned");
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  fs.writeFileSync(out, buf);
  console.log(`✓ saved: ${bird.id}  (${(buf.length / 1024).toFixed(0)} KB)`);
}

(async () => {
  console.log(`Generating ${targets.length} reference image(s) with ${MODEL}\n  → ${REF_DIR}\n`);
  let ok = 0, fail = 0;
  for (const b of targets) {
    try { await genOne(b); ok++; }
    catch (e) { console.error(`✗ ERROR ${b.id}: ${e.message}`); fail++; }
    await sleep(1200); // be gentle with rate limits
  }
  console.log(`\nDone. ${ok} processed, ${fail} failed.`);
})();
