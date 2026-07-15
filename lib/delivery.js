// ============================================================
//  Delivery media — persists a job's generated headshots (+ the
//  optional Bird ID card) so the delivery email can LINK to them
//  instead of attaching ~30 files inline. Big multi-attachment
//  emails from a young sending domain get silently dropped by
//  Gmail/Yahoo even when Resend reports "delivered"; a tiny
//  links-only email lands far more reliably.
//
//  Storage: Cloudflare R2 if configured (permanent, zero-egress);
//  otherwise disk under data/delivery-media (dev / fallback —
//  resets on redeploy on an ephemeral host). Always returns
//  ABSOLUTE URLs ready to drop into the email.
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { r2Enabled, uploadToR2 } from "./storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
export const DELIVERY_DIR = path.join(DATA_DIR, "delivery-media");
const SITE_BASE = (process.env.PUBLIC_URL || "https://headshotswithabird.com").replace(/\/$/, "");

async function toBuffer(src) {
  if (src.startsWith("data:")) return Buffer.from(src.split(",")[1], "base64");
  const r = await fetch(src);
  if (!r.ok) throw new Error(`fetch ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// Store one buffer (R2 if enabled, else disk) and return its absolute URL.
async function store(useR2, jobId, file, buf, contentType) {
  const key = `deliveries/${jobId}/${file}`;
  if (useR2) return uploadToR2(key, buf, contentType);
  fs.mkdirSync(path.join(DELIVERY_DIR, jobId), { recursive: true });
  fs.writeFileSync(path.join(DELIVERY_DIR, jobId, file), buf);
  return `${SITE_BASE}/delivery-media/${jobId}/${file}`;
}

// Persist ONE image (data URI or URL) for a job; returns its absolute URL.
// Used for the basic tier's bird-free pick, emailed at pick time.
export async function persistOne(jobId, file, src, contentType = "image/jpeg") {
  const buf = await toBuffer(src);
  return store(r2Enabled(), jobId, file, buf, contentType);
}

// Persist a job's images + card + the "you + your bird" composite;
// returns { images:[{label,url}], cardUrl, birdUrl }.
// Resilient per-file: one bad image won't sink the rest.
export async function persistDelivery(jobId, results, card, birdshot) {
  const useR2 = r2Enabled();
  const images = [];
  const list = (results || []).filter((r) => r && r.src);

  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    try {
      const buf = await toBuffer(r.src);
      const file = `headshot-${i + 1}-${r.look || i + 1}.jpg`;
      const url = await store(useR2, jobId, file, buf, "image/jpeg");
      images.push({ label: r.label || `Look ${i + 1}`, url });
    } catch (e) {
      console.error(`[delivery] image ${i}:`, e.message);
    }
  }

  let cardUrl = null;
  if (card && card.startsWith("data:image/png;base64,")) {
    try {
      const buf = Buffer.from(card.split(",")[1], "base64");
      cardUrl = await store(useR2, jobId, "bird-id-card.png", buf, "image/png");
    } catch (e) {
      console.error("[delivery] card:", e.message);
    }
  }

  let birdUrl = null;
  if (birdshot && birdshot.startsWith("data:image/png;base64,")) {
    try {
      const buf = Buffer.from(birdshot.split(",")[1], "base64");
      birdUrl = await store(useR2, jobId, "you-and-your-bird.png", buf, "image/png");
    } catch (e) {
      console.error("[delivery] birdshot:", e.message);
    }
  }

  return { images, cardUrl, birdUrl };
}
