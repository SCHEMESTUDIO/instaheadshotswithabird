// ============================================================
//  Pro Pack FAKE DOOR — demand measurement, not a product.
//  Logs clicks on the "without the bird · $2.99" results tile to
//  data/pro-interest.json so we know real demand before building
//  the actual upsell flow (see scripts/bakeoff/PLAN.md, Pro Pack
//  track). Read the tally via GET /api/admin/pro-interest?key=.
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "pro-interest.json");

function load() { try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return []; } }
function save(l) { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(l, null, 2)); }

export function addProInterest({ jobId, email }) {
  const list = load();
  list.push({ at: new Date().toISOString(), jobId: jobId || null, email: email || null });
  save(list);
  return list.length;
}

export function proInterestCount() { return load().length; }
export function listProInterest() { return load(); }
