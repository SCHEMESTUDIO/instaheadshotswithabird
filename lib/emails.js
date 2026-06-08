// ============================================================
//  Email capture list. Stored file-backed in data/emails.json.
//  `consent` = whether they opted in to marketing emails. You may
//  only send marketing to consented addresses; transactional/service
//  use applies to all. Export via the admin endpoint.
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "emails.json");

function load() { try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return []; } }
function save(l) { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(l, null, 2)); }

export function addEmail(email, consent) {
  email = String(email || "").trim().toLowerCase();
  if (!email) return;
  const list = load();
  const now = new Date().toISOString();
  const existing = list.find((e) => e.email === email);
  if (existing) {
    if (consent) existing.consent = true; // upgrade to consented; never silently revoke
    existing.lastSeen = now;
  } else {
    list.push({ email, consent: !!consent, createdAt: now, lastSeen: now });
  }
  save(list);
}

export function listEmails() { return load(); }
