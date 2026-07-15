// One-off: generate the homepage example-strip assets (2026-07-15 redesign).
// 1) Creates a FICTIONAL, AI-generated person as a realistic smartphone selfie.
// 2) Runs that selfie through the real production pipeline (buildTwoPersonPrompt,
//    includeBird:false) for all 5 basic-tier looks.
// Outputs: public/examples/source-selfie.jpg + public/examples/<look-id>.jpg
// Usage: node scripts/gen-example-headshots.mjs
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { LOOKS } from "../lib/looks.js";
import { buildTwoPersonPrompt } from "../lib/prompt.js";
import { generate } from "../lib/providers/gemini.js";

const OUT = path.resolve("public/examples");
fs.mkdirSync(OUT, { recursive: true });

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-image";

function saveDataUri(src, file) {
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(src);
  if (!m) throw new Error("unexpected src format");
  const ext = m[1] === "image/png" ? "png" : "jpg";
  const p = path.join(OUT, `${file}.${ext}`);
  fs.writeFileSync(p, Buffer.from(m[2], "base64"));
  console.log("wrote", p);
  return p;
}

// --- 1. fictional person, text-to-image (no reference photos) ---
const PERSON_PROMPT = [
  "A casual smartphone selfie of a fictional person who does not exist:",
  "a woman in her early 30s with shoulder-length dark brown hair, warm brown eyes,",
  "light-olive skin, and a natural, relaxed closed-mouth smile. Plain grey t-shirt.",
  "Shot indoors at home with ordinary window light, slightly imperfect amateur framing,",
  "front-facing camera perspective, face filling much of the frame, square 1:1.",
  "Photorealistic — indistinguishable from a real phone photo: natural skin texture,",
  "no beauty-filter smoothing, no studio lighting, no professional retouching.",
].join(" ");

async function textToImage(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
      signal: AbortSignal.timeout(120_000),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini error: ${data.error?.message || res.statusText}`);
  const part = (data.candidates?.[0]?.content?.parts || []).find((p) => p.inline_data || p.inlineData);
  const inline = part?.inline_data || part?.inlineData;
  if (!inline) throw new Error("no image returned");
  return `data:${inline.mime_type || inline.mimeType || "image/png"};base64,${inline.data}`;
}

const main = async () => {
  console.log("generating fictional person…");
  const selfieSrc = await textToImage(PERSON_PROMPT);
  const selfiePath = saveDataUri(selfieSrc, "source-selfie");

  const buf = fs.readFileSync(selfiePath);
  const mimeType = selfiePath.endsWith(".png") ? "image/png" : "image/jpeg";
  const images = [{ buffer: buf, mimeType }];

  for (const look of LOOKS) {
    const prompt = buildTwoPersonPrompt(look, null, { includeBird: false });
    console.log("generating look:", look.id);
    for (let attempt = 1; ; attempt++) {
      try {
        const { src } = await generate({ images, prompt });
        saveDataUri(src, look.id);
        break;
      } catch (e) {
        if (attempt >= 3) throw e;
        const wait = e.retryAfterMs || 8000;
        console.log(`  retry ${attempt} after ${wait}ms — ${e.message}`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  console.log("done.");
};
main().catch((e) => { console.error(e); process.exit(1); });
