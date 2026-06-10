// ============================================================
//  promptlab — fast prompt iteration, no deploy.
//
//  Renders the CURRENT lib/prompt.js (buildTwoPersonPrompt) on one
//  real person through the live provider, dumps every look onto a
//  single contact-sheet.html you open to eyeball cut-paste / likeness.
//  Edit prompt.js, re-run, compare. That's the whole loop.
//
//  Run (from project root, needs GEMINI_API_KEY in .env):
//    node scripts/promptlab.js                 # first person, all 5 looks, 2 refs
//    node scripts/promptlab.js --person bald-beard
//    node scripts/promptlab.js --looks 3       # only first 3 looks (faster/cheaper)
//    node scripts/promptlab.js --refs 1        # test the single-photo theory
//    node scripts/promptlab.js --note "v3 re-light"   # label the sheet
//
//  ~15-30s per look. Cost printed after. No --yes wall — it's cheap and
//  you're iterating.
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { LOOKS } from "../lib/looks.js";
import { buildTwoPersonPrompt } from "../lib/prompt.js";
import { getProvider } from "../lib/providers/index.js";
import { getBird } from "../lib/birds.js";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : true); };

const DIR = path.resolve(arg("dir", path.join(__dirname, "calibrate", "realfaces")));
const PERSON = arg("person", null);
const NLOOKS = Number(arg("looks", LOOKS.length));
const NREFS = Number(arg("refs", 2));
const BIRD = getBird(arg("bird", "common-raven")) || getBird("common-raven");
const NOTE = arg("note", "");
const OUT = path.join(__dirname, "promptlab-out");

function loadPerson() {
  const subdirs = fs.readdirSync(DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const name = PERSON || subdirs[0];
  if (!name) throw new Error(`No person folders in ${DIR}. Put 2 photos in ${DIR}/<name>/`);
  const files = fs.readdirSync(path.join(DIR, name)).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort().slice(0, NREFS);
  if (!files.length) throw new Error(`No images in ${DIR}/${name}/`);
  return { name, photos: files.map((f) => ({ buffer: fs.readFileSync(path.join(DIR, name, f)), mimeType: /\.png$/i.test(f) ? "image/png" : "image/jpeg" })) };
}

const toJpgDataUri = (f) => `data:${f.mimeType};base64,${f.buffer.toString("base64")}`;

async function main() {
  if (!process.env.GEMINI_API_KEY) { console.error("GEMINI_API_KEY not set in .env"); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const provider = getProvider();
  const person = loadPerson();
  const looks = LOOKS.slice(0, NLOOKS);
  const samplePrompt = buildTwoPersonPrompt(looks[0], BIRD);
  console.log(`promptlab · ${person.name} · ${person.photos.length} ref(s) · ${looks.length} looks · provider ${provider.name} · bird ${BIRD.id}`);

  const cards = [];
  const t0 = Date.now();
  for (let i = 0; i < looks.length; i++) {
    const look = looks[i];
    try {
      const { src } = await provider.generate({ images: person.photos, prompt: buildTwoPersonPrompt(look, BIRD) });
      const buf = Buffer.from(src.split(",")[1], "base64");
      const file = `${person.name}_${look.id}.jpg`;
      fs.writeFileSync(path.join(OUT, file), buf);
      cards.push({ label: look.label, src });
      console.log(`  [${i + 1}/${looks.length}] ${look.id}  ✓`);
    } catch (e) {
      cards.push({ label: look.label, error: e.message });
      console.log(`  [${i + 1}/${looks.length}] ${look.id}  ✗ ${e.message}`);
    }
  }

  const refThumbs = person.photos.map((p) => `<img src="${toJpgDataUri(p)}">`).join("");
  const lookCards = cards.map((c) => `<figure>${c.error ? `<div class="err">${c.error}</div>` : `<img src="${c.src}">`}<figcaption>${c.label}</figcaption></figure>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><title>promptlab · ${person.name}</title>
<style>body{font:14px system-ui;background:#111;color:#eee;margin:0;padding:20px}
h1{font-size:15px}.note{color:#f5c451}.refs img{height:140px;border-radius:8px;margin-right:8px}
.grid{display:flex;flex-wrap:wrap;gap:14px;margin-top:14px}
figure{margin:0;background:#1a1a1a;border:1px solid #333;border-radius:10px;overflow:hidden;width:300px}
figure img{width:100%;display:block}figcaption{padding:7px 10px;color:#aaa}
.err{padding:30px;color:#f25e74}pre{white-space:pre-wrap;background:#0a0a0a;border:1px solid #333;border-radius:8px;padding:12px;color:#9fb}</style>
<h1>promptlab · ${person.name}${NOTE ? ` · <span class="note">${NOTE}</span>` : ""}</h1>
<div class="refs">reference selfies:<br>${refThumbs}</div>
<div class="grid">${lookCards}</div>
<h1>prompt used (look 1)</h1><pre>${samplePrompt.replace(/</g, "&lt;")}</pre>`;
  const sheet = path.join(OUT, "sheet.html");
  fs.writeFileSync(sheet, html);

  const ok = cards.filter((c) => !c.error).length;
  console.log(`\n${ok}/${cards.length} rendered in ${((Date.now() - t0) / 1000).toFixed(0)}s · ~$${(ok * 0.04).toFixed(2)}`);
  console.log(`open → ${sheet}`);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
