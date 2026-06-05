// ============================================================
//  Reviews — collected after a user downloads/shares.
//  Stored file-backed in data/reviews.json. Featured headshot
//  images are persisted to data/review-media/ so the homepage
//  carousel keeps working after the provider's image URL expires.
//
//  Reviews are approved:false by default. Only approved reviews
//  appear in the public carousel — you curate which beta reviews
//  go live (via the admin endpoint or by editing the JSON).
// ============================================================

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "reviews.json");
export const MEDIA_DIR = path.join(DATA_DIR, "review-media");

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch { return []; }
}
function save(list) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
}

export function wordCount(s) {
  return (s || "").trim().split(/\s+/).filter(Boolean).length;
}

// Persist an image (remote URL or data: URI) to MEDIA_DIR; return its public path.
async function persistImage(src, id) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  let buf;
  if (src.startsWith("data:")) {
    buf = Buffer.from(src.split(",")[1], "base64");
  } else {
    const r = await fetch(src);
    if (!r.ok) throw new Error("Could not fetch headshot to save.");
    buf = Buffer.from(await r.arrayBuffer());
  }
  const file = `${id}.jpg`;
  fs.writeFileSync(path.join(MEDIA_DIR, file), buf);
  return `/review-media/${file}`;
}

export async function addReview({ stars, text, name, bird, featuredSrc, consent }) {
  const s = Math.round(Number(stars));
  if (!(s >= 1 && s <= 5)) throw new Error("Please give a star rating from 1 to 5.");
  if (wordCount(text) > 30) throw new Error("Reviews are limited to 30 words.");

  const id = randomUUID().slice(0, 8);
  let media = null;
  if (consent && featuredSrc) {
    try { media = await persistImage(featuredSrc, id); }
    catch (e) { console.error("[review media]", e.message); }
  }

  const review = {
    id, stars: s,
    text: (text || "").trim(),
    name: (name || "").trim().slice(0, 40) || "Anonymous",
    birdName: bird?.name || null,
    birdEmoji: bird?.emoji || null,
    media,
    consent: !!consent,
    approved: false,
    createdAt: new Date().toISOString(),
  };
  const list = load();
  list.push(review);
  save(list);
  return review;
}

export function listReviews({ approvedOnly = true } = {}) {
  const list = load();
  const filtered = approvedOnly ? list.filter((r) => r.approved) : list;
  return filtered.map((r) => ({
    id: r.id, stars: r.stars, text: r.text, name: r.name,
    birdName: r.birdName, birdEmoji: r.birdEmoji, media: r.media,
    approved: r.approved, createdAt: r.createdAt,
  }));
}

export function setApproved(id, approved) {
  const list = load();
  const r = list.find((x) => x.id === id);
  if (!r) throw new Error("Review not found.");
  r.approved = !!approved;
  save(list);
  return r;
}
