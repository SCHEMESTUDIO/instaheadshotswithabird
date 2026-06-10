// ============================================================
//  CALIBRATION HARNESS — step 3 of 3 (optional): FIT
//
//  The register.html already shows the recommendation. This is the
//  same math headless, for auditing or re-running after you tweak
//  labels. Reads manifest.json (scores) + labels.json (your keep/bad
//  calls) and prints AUC + the threshold tradeoff table.
//
//  Usage:
//    node scripts/calibrate/fit.js                       # uses ./out/manifest.json + ./out/labels.json
//    node scripts/calibrate/fit.js --manifest a.json --labels b.json
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const MANI = path.resolve(arg("manifest", path.join(__dirname, "out", "manifest.json")));
const LBL = path.resolve(arg("labels", path.join(__dirname, "out", "labels.json")));
const genCost = Number(arg("gen-cost", 0.08));

function load(p, what) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { console.error(`Couldn't read ${what}: ${p}`); process.exit(1); } }

const manifest = load(MANI, "manifest");
const labelDoc = load(LBL, "labels");
const scoreById = new Map(manifest.rows.map((r) => [r.id, r.score]));

const good = [], bad = [];
for (const l of labelDoc.labels) {
  const s = scoreById.get(l.id);
  if (s == null) continue;
  if (l.label === "keep") good.push(s);
  else if (l.label === "bad") bad.push(s);
}

function auc(g, b) { if (!g.length || !b.length) return NaN; let w = 0, t = 0; for (const x of g) for (const y of b) { if (x > y) w++; else if (x === y) t++; } return (w + 0.5 * t) / (g.length * b.length); }
function sweep(g, b) {
  const uniq = [...new Set([...g, ...b])].sort((a, c) => a - c);
  const cands = [uniq[0] - 0.001];
  for (let k = 0; k < uniq.length - 1; k++) cands.push((uniq[k] + uniq[k + 1]) / 2);
  cands.push(uniq[uniq.length - 1] + 0.001);
  const N = g.length + b.length;
  return cands.map((t) => {
    const caught = b.filter((s) => s < t).length, wrong = g.filter((s) => s < t).length;
    return { t, recall: caught / b.length, fpr: wrong / g.length, J: caught / b.length - wrong / g.length, flaggedFrac: (caught + wrong) / N };
  });
}
const pct = (x) => (100 * x).toFixed(0) + "%";

if (good.length < 3 || bad.length < 3) {
  console.error(`Need ≥3 of each label. Have keep=${good.length} bad=${bad.length}. Label more in register.html.`);
  process.exit(1);
}

const A = auc(good, bad);
const sw = sweep(good, bad);
const best = sw.reduce((a, c) => (c.J > a.J ? c : a));

console.log(`\nLabelled: ${good.length} keep · ${bad.length} uncanny · provider ${labelDoc.provider || manifest.provider}`);
console.log(`AUC (P[good scores higher than uncanny]) = ${A.toFixed(3)}`);
console.log(
  A >= 0.8 ? "  → strong separation: a threshold works."
  : A >= 0.65 ? "  → partial separation: threshold helps but misses subtle-uncanny; also fix upstream."
  : "  → NO separation: threshold-tuning is a dead end. The uncanny problem is upstream (prompt/provider/restore), not the gate."
);

if (A < 0.65) console.log(`\n⚠ AUC too low to recommend a threshold — the table below is shown only to make the overlap visible.`);
console.log(`\n${A < 0.65 ? "Best-available (not advised)" : "Recommended"}  SIM_THRESHOLD = ${(Math.round(best.t * 100) / 100).toFixed(2)}`);
console.log(`  catches ${pct(best.recall)} of uncanny · wrongly re-rolls ${pct(best.fpr)} of good · re-rolls ${pct(best.flaggedFrac)} overall (~$${(best.flaggedFrac * genCost).toFixed(3)}/render)\n`);

console.log("threshold   uncanny-caught   good-rerolled   renders-rerolled   $/render");
const step = Math.max(1, Math.floor(sw.length / 10));
for (let k = 0; k < sw.length; k += step) {
  const r = sw[k]; const m = Math.abs(r.t - best.t) < 1e-9 ? "  ◀ rec" : "";
  console.log(`  ${(Math.round(r.t * 100) / 100).toFixed(2)}        ${pct(r.recall).padStart(6)}          ${pct(r.fpr).padStart(6)}           ${pct(r.flaggedFrac).padStart(6)}          $${(r.flaggedFrac * genCost).toFixed(3)}${m}`);
}
console.log("\nNote: synthetic single-photo inputs run a touch low vs production two-photo jobs — confirm the cut on a few real jobs (SIM_THRESHOLD=0, read logged scores).\n");
