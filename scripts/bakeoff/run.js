// ============================================================
//  BAKE-OFF RUNNER — one test per invocation, ~20 renders, ~$1.
//
//  Runs ONE config from configs.js across the fixed face panel
//  (scripts/calibrate/realfaces: one subfolder per person) × all
//  5 production looks, through the REAL production code paths
//  (lib/prompt.js + lib/providers). No scoring, no gates, no
//  re-rolls: it saves renders, records latency, and bakes a
//  self-contained review.html where you tick failure boxes.
//  Human eyeballs are the metric; the page does the counting.
//
//  Usage:
//    node scripts/bakeoff/run.js T1            # print plan + cost, do nothing
//    node scripts/bakeoff/run.js T1 --yes      # actually run (~$1)
//    node scripts/bakeoff/run.js --list-models # list Gemini image models (for T3)
//
//  Output: scripts/bakeoff/results/<testId>/
//    renders/*.jpg   manifest.json   review.html  ← open & tick
//
//  NEVER COMMITTED: results/ is gitignored (real faces).
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Jimp from "jimp";
import { LOOKS } from "../../lib/looks.js";
import { buildTwoPersonPrompt } from "../../lib/prompt.js";
import { getBird, BIRD_IDS } from "../../lib/birds.js";
import { CONFIGS } from "./configs.js";

// Prompt variants under test. "preserve-expression" swaps the line that
// invites the model to invent a new expression (the T3 uncanny mechanism)
// for one that pins it to the reference.
function applyPromptMod(prompt, mod) {
  if (!mod) return prompt;
  if (mod === "preserve-expression") {
    const out = prompt.replace(
      "a natural, relaxed expression.",
      "keep the person's facial expression EXACTLY as in the reference photo — if they are smiling, the same smile; if not, do NOT add one. Never invent a new expression."
    );
    if (out === prompt) console.warn("WARN: preserve-expression anchor not found in prompt — appending instead.");
    return out !== prompt ? out
      : prompt + " IMPORTANT: keep the person's facial expression EXACTLY as in the reference photo; never invent a new expression.";
  }
  throw new Error(`Unknown promptMod: ${mod}`);
}

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PANEL_DIR = path.join(__dirname, "..", "calibrate", "realfaces");

// ---------- list-models helper (find the current Gemini image model for T3) ----------
if (process.argv.includes("--list-models")) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) { console.error("GEMINI_API_KEY not set in .env"); process.exit(1); }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=200`);
  const data = await res.json();
  if (!res.ok) { console.error("Gemini error:", data.error?.message || res.statusText); process.exit(1); }
  const models = (data.models || []).filter((m) => /image/i.test(m.name + " " + (m.description || "")));
  console.log("\nGemini models mentioning 'image':\n");
  for (const m of models) console.log(`  ${m.name.replace("models/", "")}  —  ${m.displayName || ""}`);
  console.log("\nPaste the right one into configs.js → T3.model\n");
  process.exit(0);
}

// ---------- pick config ----------
const testId = process.argv[2];
const GO = process.argv.includes("--yes");
const cfg = CONFIGS.find((c) => c.id === testId);
if (!cfg) {
  console.error(`Usage: node scripts/bakeoff/run.js <testId> [--yes]\nTests: ${CONFIGS.map((c) => c.id).join(", ")} (see PLAN.md)`);
  process.exit(1);
}
if (cfg.model === "FILL_ME_IN") {
  console.error(`${cfg.id} has model: FILL_ME_IN — edit scripts/bakeoff/configs.js first (see the comment there).`);
  process.exit(1);
}

// ---------- load the panel ----------
const readImg = (p) => ({ buffer: fs.readFileSync(p), mimeType: /\.png$/i.test(p) ? "image/png" : "image/jpeg" });
function loadPanel() {
  const ids = fs.readdirSync(PANEL_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((d) => {
      const photos = fs.readdirSync(path.join(PANEL_DIR, d.name))
        .filter((f) => /\.(jpe?g|png)$/i.test(f)).sort().slice(0, 2)
        .map((f) => readImg(path.join(PANEL_DIR, d.name, f)));
      return { name: d.name, photos };
    })
    .filter((i) => i.photos.length);
  if (!ids.length) throw new Error(`No face panel found in ${PANEL_DIR}`);
  return ids;
}

// Deterministic bird per identity so bird choice never differs between tests.
const pickBird = (name) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return getBird(BIRD_IDS[h % BIRD_IDS.length]);
};

async function thumb(buf) {
  const img = await Jimp.read(buf);
  img.scaleToFit(820, 820).quality(82);
  return img.getBase64Async(Jimp.MIME_JPEG);
}
const bufferFromSrc = async (src) =>
  src.startsWith("data:") ? Buffer.from(src.split(",")[1], "base64") : Buffer.from(await (await fetch(src)).arrayBuffer());

// ---------- debird mode: inputs are renders from earlier tests ----------
const DEBIRD_PROMPT =
  "Remove the bird from this photograph completely. Change NOTHING else: keep the person's face, " +
  "expression, hair, outfit, pose, lighting, background, colour grade and framing EXACTLY as they are. " +
  "Fill the area where the bird was naturally and seamlessly. Photorealistic, high detail.";

function loadDebirdItems(cfg) {
  const bySource = cfg.source.map((src) => {
    const dir = path.join(__dirname, "results", src, "renders");
    if (!fs.existsSync(dir)) { console.error(`Missing ${dir} — run ${src} first.`); process.exit(1); }
    return fs.readdirSync(dir).filter((f) => /\.jpg$/i.test(f)).sort()
      .map((f) => ({ key: `${src}_${f.replace(/\.jpg$/i, "")}`, file: path.join(dir, f) }));
  });
  // round-robin across sources for an even spread of faces/looks
  const items = [];
  for (let i = 0; items.length < cfg.limit; i++) {
    let added = false;
    for (const list of bySource) if (list[i] && items.length < cfg.limit) { items.push(list[i]); added = true; }
    if (!added) break;
  }
  return items;
}

const isDebird = cfg.mode === "debird";
const panel = isDebird ? [] : loadPanel();
const debirdItems = isDebird ? loadDebirdItems(cfg) : [];
const total = isDebird ? debirdItems.length : panel.length * LOOKS.length;

console.log(`\n──────── bake-off ${cfg.id}: ${cfg.label} ────────`);
console.log(`  question   ${cfg.question}`);
console.log(`  provider   ${cfg.provider} · model ${cfg.model}${isDebird ? " · EDIT mode" : ` · ${cfg.photos} photo(s)`}`);
console.log(`  inputs     ${isDebird ? `${total} renders from ${cfg.source.join("+")}` : panel.map((p) => p.name).join(", ")}`);
console.log(`  renders    ${total}  (~$${(total * cfg.genCost).toFixed(2)})`);
console.log(`──────────────────────────────────────────────\n`);
if (!GO) { console.log("Dry run. Add --yes to spend the above and generate.\n"); process.exit(0); }

// ---------- load provider AFTER setting env (providers read env at import) ----------
if (cfg.provider === "gemini") process.env.GEMINI_MODEL = cfg.model;
else process.env.REPLICATE_MODEL = cfg.model;
const provider = await import(`../../lib/providers/${cfg.provider}.js`);

// ---------- run ----------
const OUT = path.join(__dirname, "results", cfg.id);
const RENDERS = path.join(OUT, "renders");
fs.mkdirSync(RENDERS, { recursive: true });

const rows = [];
let n = 0;
const t0 = Date.now();

if (isDebird) {
  for (const item of debirdItems) {
    n++;
    try {
      const orig = { buffer: fs.readFileSync(item.file), mimeType: "image/jpeg" };
      const t = Date.now();
      let src;
      try {
        ({ src } = await provider.generate({ images: [orig], prompt: DEBIRD_PROMPT }));
      } catch (e) {
        console.warn(`        retrying after: ${e.message.slice(0, 80)}`);
        await new Promise((r) => setTimeout(r, 5000));
        ({ src } = await provider.generate({ images: [orig], prompt: DEBIRD_PROMPT }));
      }
      const ms = Date.now() - t;
      const buf = await bufferFromSrc(src);
      fs.mkdirSync(RENDERS, { recursive: true });
      fs.writeFileSync(path.join(RENDERS, `${item.key}.jpg`), buf);
      rows.push({ key: item.key, face: item.key, look: "de-bird edit", ms,
                  selfieThumb: await thumb(orig.buffer), renderThumb: await thumb(buf) });
      console.log(`[${n}/${total}] ${item.key}  ${(ms / 1000).toFixed(1)}s`);
    } catch (e) {
      rows.push({ key: item.key, face: item.key, look: "de-bird edit", error: e.message });
      console.warn(`[${n}/${total}] ${item.key}  FAILED: ${e.message}`);
    }
  }
}

for (const id of panel) {
  const photos = id.photos.slice(0, cfg.photos);
  const bird = pickBird(id.name);
  const selfieThumb = await thumb(photos[0].buffer);
  for (const look of LOOKS) {
    n++;
    const tag = `${id.name} × ${look.id}`;
    try {
      const t = Date.now();
      let src;
      try {
        ({ src } = await provider.generate({ images: photos, prompt: applyPromptMod(buildTwoPersonPrompt(look, bird), cfg.promptMod) }));
      } catch (e) {
        // one retry for transient capacity blips ("high demand" etc.)
        console.warn(`        retrying after: ${e.message.slice(0, 80)}`);
        await new Promise((r) => setTimeout(r, 5000));
        ({ src } = await provider.generate({ images: photos, prompt: applyPromptMod(buildTwoPersonPrompt(look, bird), cfg.promptMod) }));
      }
      const ms = Date.now() - t;
      const buf = await bufferFromSrc(src);
      const file = `${id.name}_${look.id}.jpg`;
      fs.writeFileSync(path.join(RENDERS, file), buf);
      rows.push({ key: `${id.name}_${look.id}`, face: id.name, look: look.label, ms,
                  selfieThumb, renderThumb: await thumb(buf) });
      console.log(`[${n}/${total}] ${tag}  ${(ms / 1000).toFixed(1)}s`);
    } catch (e) {
      rows.push({ key: `${id.name}_${look.id}`, face: id.name, look: look.label, error: e.message });
      console.warn(`[${n}/${total}] ${tag}  FAILED: ${e.message}`);
    }
  }
}

// ---------- manifest + review page ----------
const ok = rows.filter((r) => !r.error);
const meta = {
  test: cfg.id, label: cfg.label, provider: cfg.provider, model: cfg.model, photos: cfg.photos,
  createdAt: new Date().toISOString(), renders: ok.length, errors: rows.length - ok.length,
  avgSeconds: ok.length ? +(ok.reduce((s, r) => s + r.ms, 0) / ok.length / 1000).toFixed(1) : null,
};
fs.writeFileSync(path.join(OUT, "manifest.json"),
  JSON.stringify({ ...meta, rows: rows.map(({ selfieThumb, renderThumb, ...r }) => r) }, null, 2));
fs.writeFileSync(path.join(OUT, "review.html"), buildReview(ok, meta));

console.log(`\nDone in ${((Date.now() - t0) / 60000).toFixed(1)} min · avg ${meta.avgSeconds}s/render · ${meta.errors} errors`);
console.log(`Open and tick:  ${path.join(OUT, "review.html")}\n`);

// ---------- self-contained review page ----------
function buildReview(rows, meta) {
  // configs may override the failure classes (e.g. debird mode); default = generation classes
  const FAILS = cfg.fails || [
    ["gender", "Gender swap"],
    ["hair", "Wrong hair / extra hair"],
    ["composite", "Pasted-on / composited head"],
    ["framing", "Head not centred / bad crop"],
    ["bird", "Bird missing, doubled or wrong"],
    ["other", "Other embarrassment"],
  ];
  const leftLabel = isDebird ? "original" : "reference";
  const rightLabel = isDebird ? "edited (bird removed)" : "render";
  return `<!doctype html><meta charset="utf-8"><title>Bake-off ${meta.test} review</title>
<style>
body{font:15px/1.45 system-ui;margin:24px;background:#fafaf7;color:#222}
h1{font-size:20px} .sub{color:#666;margin-bottom:18px}
.row{display:flex;gap:14px;align-items:flex-start;background:#fff;border:1px solid #e4e4de;border-radius:10px;padding:12px;margin-bottom:12px;flex-wrap:wrap}
.row img{width:400px;max-width:44vw;border-radius:8px;display:block;cursor:zoom-in}
.row.bad{border-color:#d33;background:#fff6f6}
.meta{font-weight:600;margin-bottom:6px}
label{display:block;margin:2px 0;cursor:pointer;white-space:nowrap}
#summary{position:sticky;top:0;background:#0f3d2e;color:#fff;padding:12px 16px;border-radius:10px;margin-bottom:20px}
#summary b{font-size:18px}
button{margin-top:8px;padding:6px 12px;border-radius:6px;border:0;background:#2dbd85;color:#fff;font-weight:600;cursor:pointer}
</style>
<h1>${meta.test} — ${meta.label}</h1>
<div class="sub">${meta.provider} · ${meta.model} · ${meta.photos} photo(s) · avg ${meta.avgSeconds}s/render · ${meta.renders} renders, ${meta.errors} errors</div>
<div id="summary"></div>
${rows.map((r) => `
<div class="row" data-key="${r.key}">
  <img src="${r.selfieThumb}" title="${leftLabel} — click for full size" onclick="window.open(this.src)">
  <img src="${r.renderThumb}" title="${rightLabel} — click for full size" onclick="window.open('renders/${r.key}.jpg')">
  <div>
    <div class="meta">${r.face} · ${r.look} · ${(r.ms / 1000).toFixed(1)}s</div>
    ${FAILS.map(([k, lbl]) => `<label><input type="checkbox" data-fail="${k}"> ${lbl}</label>`).join("")}
  </div>
</div>`).join("")}
<script>
const KEY='bakeoff-${meta.test}', FAILS=${JSON.stringify(FAILS.map(([k]) => k))};
const state=JSON.parse(localStorage.getItem(KEY)||'{}');
document.querySelectorAll('.row').forEach(row=>{
  const k=row.dataset.key;
  row.querySelectorAll('input').forEach(cb=>{
    cb.checked=!!(state[k]||{})[cb.dataset.fail];
    cb.onchange=()=>{state[k]=state[k]||{};state[k][cb.dataset.fail]=cb.checked;
      localStorage.setItem(KEY,JSON.stringify(state));refresh();};
  });
});
function refresh(){
  let failed=0;const byClass={};
  document.querySelectorAll('.row').forEach(row=>{
    const any=[...row.querySelectorAll('input')].some(c=>c.checked);
    row.classList.toggle('bad',any); if(any)failed++;
    row.querySelectorAll('input').forEach(c=>{if(c.checked)byClass[c.dataset.fail]=(byClass[c.dataset.fail]||0)+1;});
  });
  const total=document.querySelectorAll('.row').length;
  const detail=Object.entries(byClass).map(([k,v])=>k+':'+v).join(' ')||'none';
  document.getElementById('summary').innerHTML=
    '<b>'+failed+' / '+total+' renders with an embarrassing failure</b><br>By class: '+detail+
    '<br><button onclick="copyRow()">Copy scoreboard row for PLAN.md</button>';
  window.__row='| ${meta.test} | ${meta.model} | ${meta.photos} | '+failed+'/'+total+' | '+detail+' | ${meta.avgSeconds}s |';
}
function copyRow(){navigator.clipboard.writeText(window.__row);}
refresh();
</script>`;
}
