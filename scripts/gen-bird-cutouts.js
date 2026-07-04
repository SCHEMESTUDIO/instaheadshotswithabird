// ============================================================
//  Generate cutout-ready bird art (run once, locally).
//
//  Step 1 of 2: renders each species on a PURE WHITE background,
//  full body, in profile facing the viewer's LEFT (so it looks
//  into the frame when composited bottom-right on a headshot).
//  Step 2 (scripts/make-cutouts.py) removes the background into
//  transparent PNGs at public/birds/cutouts/{id}.png — those are
//  the runtime assets the Bird ID card + bird-version download use.
//
//  Usage:
//    node scripts/gen-bird-cutouts.js                # all birds (skips existing)
//    node scripts/gen-bird-cutouts.js shoebill kea   # only these ids
//    node scripts/gen-bird-cutouts.js --force ...    # regenerate even if present
//
//  Needs REPLICATE_API_TOKEN in .env. Saves JPGs to public/birds/.
// ============================================================

import "dotenv/config";
import fs from "fs";
import { BIRDS, getBird } from "../lib/birds.js";
import { REF_DIR, refPath } from "../lib/birdref.js";
import { birdForm } from "../lib/birdref.js";

// Provider: gemini (default — same key as prod) or replicate (flux).
// NOTE 2026-07-04: the Replicate account was under $5 credit (throttled to
// 6 req/min, not enough to finish 148), so refs were generated via Gemini.
const REF_PROVIDER = (process.env.REF_PROVIDER || "gemini").toLowerCase();
const MODEL = process.env.REF_MODEL || (REF_PROVIDER === "gemini" ? "gemini-3.1-flash-image" : "black-forest-labs/flux-1.1-pro");
const CONCURRENCY = Number(process.env.REF_CONCURRENCY || 4);
const token = process.env.REPLICATE_API_TOKEN;
const gkey = process.env.GEMINI_API_KEY;
if (REF_PROVIDER === "replicate" && !token) { console.error("✗ Set REPLICATE_API_TOKEN in .env"); process.exit(1); }
if (REF_PROVIDER === "gemini" && !gkey) { console.error("✗ Set GEMINI_API_KEY in .env"); process.exit(1); }
fs.mkdirSync(REF_DIR, { recursive: true });

// Cutout-friendly framing: white bg + hard isolation makes background
// removal near-lossless; profile facing viewer's left means the bird
// looks INTO the frame when placed at the bottom-right of a headshot.
function buildCutoutPrompt(bird) {
  return [
    `A professional wildlife photograph of a single ${bird.name} (${bird.sci}),`,
    `${birdForm(bird)}.`,
    `${bird.look}.`,
    "The whole bird, FULL BODY including legs and feet fully visible, standing or perched in profile facing the viewer's LEFT,",
    "sharp focus, accurate natural colours and markings, even soft lighting,",
    "isolated on a plain pure white seamless background, no shadow on the background, no perch, no branch, no props,",
    "centered with clear margin on all sides, no text, no watermark, no other animals.",
  ].join(" ");
}

const args = process.argv.slice(2);
const force = args.includes("--force");
// --limit N: process only the first N MISSING birds (lets a supervised runner
// batch the full roster in small, bounded chunks)
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
const ids = args.filter((a) => !a.startsWith("--"));
let targets = ids.length ? ids.map(getBird).filter(Boolean) : BIRDS;
if (Number.isFinite(limit)) targets = targets.filter((b) => force || !fs.existsSync(refPath(b.id))).slice(0, limit);
if (ids.length && targets.length !== ids.length) {
  console.warn("⚠ some ids not found:", ids.filter((i) => !getBird(i)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function genGemini(bird, out) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": gkey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildCutoutPrompt(bird) + " Square 1:1 image." }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
      signal: AbortSignal.timeout(120_000),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || res.statusText);
  const part = (data.candidates?.[0]?.content?.parts || []).find((p) => p.inline_data || p.inlineData);
  const inline = part?.inline_data || part?.inlineData;
  if (!inline) throw new Error("no image returned");
  const buf = Buffer.from(inline.data, "base64");
  fs.writeFileSync(out, buf);
  console.log(`✓ saved: ${bird.id}  (${(buf.length / 1024).toFixed(0)} KB)`);
  return "ok";
}

async function genOne(bird) {
  const out = refPath(bird.id);
  if (fs.existsSync(out) && !force) { console.log("· skip (exists):", bird.id); return "skip"; }
  if (REF_PROVIDER === "gemini") return genGemini(bird, out);
  const res = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "wait" },
    body: JSON.stringify({ input: { prompt: buildCutoutPrompt(bird), aspect_ratio: "1:1", output_format: "jpg", safety_tolerance: 2 } }),
  });
  let p = await res.json();
  if (!res.ok) throw new Error(p.detail || p.error || res.statusText);
  while (p.status && p.status !== "succeeded" && p.status !== "failed" && p.urls?.get) {
    await sleep(1500);
    p = await (await fetch(p.urls.get, { headers: { Authorization: `Bearer ${token}` } })).json();
  }
  if (p.status === "failed" || p.error) throw new Error(String(p.error || "generation failed"));
  const url = Array.isArray(p.output) ? p.output[0] : p.output;
  if (!url) throw new Error("no image returned");
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  fs.writeFileSync(out, buf);
  console.log(`✓ saved: ${bird.id}  (${(buf.length / 1024).toFixed(0)} KB)`);
  return "ok";
}

(async () => {
  console.log(`Generating ${targets.length} cutout source image(s) with ${MODEL} → ${REF_DIR}\n`);
  let ok = 0, fail = 0, cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const b = targets[cursor++];
      try { await genOne(b); ok++; }
      catch (e) { fail++; console.error(`✗ ${b.id}: ${e.message}`); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
  console.log(`\nDone. ${ok} ok · ${fail} failed. Re-run to retry failures (existing files are skipped).`);
})();
