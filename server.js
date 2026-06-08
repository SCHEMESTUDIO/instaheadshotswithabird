import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import Stripe from "stripe";
import fs from "fs";
import heicConvert from "heic-convert";
import { buildPrompt, buildMultiPrompt, buildTwoPersonPrompt } from "./lib/prompt.js";
import { LOOKS } from "./lib/looks.js";
import { hasRef, refPath, refPublicUrl } from "./lib/birdref.js";
import { imageDimensions } from "./lib/imagesize.js";
import * as kontextMulti from "./lib/providers/kontext-multi.js";
import { enhance } from "./lib/postprocess.js";
import { restoreFace } from "./lib/restore.js";
import { faceSimilarity } from "./lib/similarity.js";
import { assignBird, stats } from "./lib/assign.js";
import { getProvider } from "./lib/providers/index.js";
import { addReview, listReviews, setApproved, wordCount, MEDIA_DIR } from "./lib/reviews.js";
import { addEmail, listEmails } from "./lib/emails.js";
import { sendHeadshots } from "./lib/mail.js";

dotenv.config();

const PRICE_CENTS = Number(process.env.PRICE_CENTS || 100);
const DAILY_CAP = Number(process.env.DAILY_CAP || 20);
const CONCURRENCY = Number(process.env.CONCURRENCY || 1); // serial by default — respects Replicate's low-credit burst limit. Raise once credit > $5.
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const USE_BIRD_REF = process.env.USE_BIRD_REF !== "false"; // use the locked reference image when one exists
const PROVIDER_NAME = (process.env.PROVIDER || "replicate").toLowerCase();
const ENHANCE = process.env.ENHANCE !== "false"; // light contrast + sharpen on outputs
const RESTORE = process.env.RESTORE !== "false" && !!process.env.REPLICATE_API_TOKEN; // ON by default; set RESTORE=false to disable. codeformer_fidelity tuned in lib/restore.js
const MIN_IMAGE_DIM = Number(process.env.MIN_IMAGE_DIM || 768); // reject tiny uploads that produce bad results
// ---- re-roll quality gate (catches uncanny / wrong-person renders) ----
const SIMILARITY_GATE = process.env.SIMILARITY_GATE !== "false" && !!process.env.REPLICATE_API_TOKEN; // score each render vs the selfie
const SIM_THRESHOLD = Number(process.env.SIM_THRESHOLD || 0.5); // below this 0–1 score → re-roll. NEEDS LIVE CALIBRATION (selfie-vs-AI scores lower than two real photos)
const REROLLS_PER_LOOK = Number(process.env.REROLLS_PER_LOOK || 1); // extra attempts per look beyond the first
const MAX_REROLLS = Number(process.env.MAX_REROLLS || 3); // global per-job cap so cost stays under the $1 charge
const PAYMENTS_ENABLED = !!process.env.STRIPE_SECRET_KEY;
const FREE_CODES = (process.env.FREE_CODES || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean); // beta codes that skip payment
const stripe = PAYMENTS_ENABLED ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const app = express();
app.set("trust proxy", true); // honor x-forwarded-proto so Stripe redirect URLs are https behind a host's proxy
const upload = multer({ limits: { fileSize: 12 * 1024 * 1024, files: 2 } });

// ---- Stripe webhook (raw body) BEFORE express.json ----
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => {
  if (!PAYMENTS_ENABLED) return res.json({ ok: true, skipped: true });
  let event = req.body;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  try {
    if (secret) event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], secret);
    else event = JSON.parse(req.body.toString());
  } catch (err) { return res.status(400).send(`Webhook error: ${err.message}`); }
  if (event.type === "checkout.session.completed") {
    const job = jobs.get(event.data.object?.metadata?.jobId);
    if (job && !job.paid) { job.paid = true; startGeneration(job); }
  }
  res.json({ received: true });
});

app.use(express.json());
app.use("/review-media", express.static(MEDIA_DIR));
app.use(express.static("public"));

function baseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

// ---- per-IP daily cap on actual generations ----
const counts = new Map();
let resetAt = nextMidnight();
function nextMidnight() { const d = new Date(); d.setHours(24, 0, 0, 0); return d.getTime(); }
function peek(ip) { if (Date.now() > resetAt) { counts.clear(); resetAt = nextMidnight(); } return counts.get(ip) || 0; }
function bump(ip) { counts.set(ip, (counts.get(ip) || 0) + 1); }

// ---- in-memory job store ----
const jobs = new Map();
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, j] of jobs) if (j.createdAt < cutoff) jobs.delete(id);
}, 5 * 60 * 1000).unref?.();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function throttleWaitMs(msg) {
  const m = /resets in ~?(\d+)\s*s/i.exec(msg || "");
  return (m ? Number(m[1]) : 12) * 1000 + 1500; // honor Replicate's reset hint, padded
}

function isHeic(buf) {
  if (!buf || buf.length < 12) return false;
  if (buf.toString("latin1", 4, 8) !== "ftyp") return false; // ISO-BMFF box
  return /heic|heif|heix|hevc|hevx|mif1|msf1/.test(buf.toString("latin1", 8, 12).toLowerCase());
}

function withBirdImage(bird) {
  if (!bird) return bird;
  return { ...bird, image: hasRef(bird.id) ? refPublicUrl(bird.id) : null };
}

async function finalizeImage(src) {
  if (!src) return src;
  if (RESTORE) { try { src = await restoreFace(src); } catch (e) { console.error("[restore]", e.message); } }
  if (!ENHANCE) return src;
  try {
    const bytes = src.startsWith("data:")
      ? Buffer.from(src.split(",")[1], "base64")
      : Buffer.from(await (await fetch(src)).arrayBuffer());
    const out = await enhance(bytes);
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch (e) {
    console.error("[enhance]", e.message); // fall back to the original image
    return src;
  }
}

const dataUri = (img) => (img ? `data:${img.mimeType};base64,${img.buffer.toString("base64")}` : null);

// One raw generation (no finalize). Retries through rate limits; throws if all attempts fail.
async function rawGenerate(job, look, mode, twoPerson, useRef) {
  const photos = job.photos || [];
  const MAX_ATTEMPTS = 6;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      let src;
      if (twoPerson) {
        if (PROVIDER_NAME === "gemini") {
          // Gemini Nano Banana takes both selfies as references in one call
          ({ src } = await getProvider().generate({ images: photos, prompt: buildTwoPersonPrompt(look, job.bird) }));
        } else {
          ({ src } = await kontextMulti.generateMulti({ imageA: photos[0], imageB: photos[1], prompt: buildTwoPersonPrompt(look, job.bird) }));
        }
      } else if (useRef) {
        const birdImage = { buffer: fs.readFileSync(refPath(job.bird.id)), mimeType: "image/jpeg" };
        ({ src } = await kontextMulti.generateMulti({ imageA: photos[0], imageB: birdImage, prompt: buildMultiPrompt(look) }));
      } else {
        ({ src } = await getProvider().generate({ images: [photos[0]], prompt: buildPrompt(look, job.bird) }));
      }
      return src;
    } catch (err) {
      lastErr = err;
      console.error(`[job ${job.id}] ${look.id} try ${attempt} (${mode}): ${err.message}`);
      if (attempt < MAX_ATTEMPTS) {
        const throttled = /throttle/i.test(err.message || "");
        await sleep(throttled ? throttleWaitMs(err.message) : 2500); // wait out rate limits before retrying
      }
    }
  }
  throw lastErr || new Error("Generation failed.");
}

async function generateLook(job, look) {
  const photos = job.photos || [];
  const twoPerson = photos.length >= 2;                              // 2 selfies → better likeness
  const useRef = !twoPerson && USE_BIRD_REF && hasRef(job.bird.id);  // else lock the bird via reference image
  const mode = twoPerson ? "2-photo" : useRef ? "ref" : "single";
  const selfieUrl = dataUri(photos[0]);                              // reference for the similarity gate
  if (job.rerollsUsed == null) job.rerollsUsed = 0;

  let best = null; // { src, score } — keep the highest-scoring candidate we've seen
  for (let round = 0; round <= REROLLS_PER_LOOK; round++) {
    let raw;
    try {
      raw = await rawGenerate(job, look, mode, twoPerson, useRef);
    } catch (err) {
      if (best) break;                                               // a generation failed but we already have a candidate
      return { look: look.id, label: look.label, error: err.message || "Generation failed." };
    }

    // Score this raw render against the selfie (cheap, non-fatal).
    let score = null;
    if (SIMILARITY_GATE && selfieUrl) {
      const sim = await faceSimilarity(selfieUrl, raw);
      score = sim?.score ?? null;
      if (sim && sim.faces2 === 0) score = 0;                        // no face detected in output → definitely re-roll
      if (sim) console.log(`[job ${job.id}] ${look.id} round ${round} score ${score == null ? "n/a" : score.toFixed(3)} (faces ${sim.faces1}/${sim.faces2})`);
    }

    if (best === null || (score ?? -1) > (best.score ?? -1)) best = { src: raw, score };

    const pass = score == null || score >= SIM_THRESHOLD;            // null = couldn't score → don't block delivery
    const moreRounds = round < REROLLS_PER_LOOK;
    const budgetLeft = job.rerollsUsed < MAX_REROLLS;
    if (pass || !moreRounds || !budgetLeft) break;
    job.rerollsUsed++;                                               // consume one global re-roll
    console.log(`[job ${job.id}] ${look.id} re-roll (score < ${SIM_THRESHOLD}); rerolls ${job.rerollsUsed}/${MAX_REROLLS}`);
  }

  const src = await finalizeImage(best.src);
  const out = { look: look.id, label: look.label, src };
  if (best.score != null) out.score = Number(best.score.toFixed(3));
  return out;
}

async function startGeneration(job) {
  if (job.status === "generating" || job.status === "complete") return;
  job.status = "generating";
  let cursor = 0;
  async function worker() {
    while (cursor < LOOKS.length) {
      const i = cursor++;
      job.results[i] = await generateLook(job, LOOKS[i]);
      job.done++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, LOOKS.length) }, worker));
  job.status = job.results.every((r) => r?.error) ? "failed" : "complete";
  if (job.status === "complete" && job.email) {
    sendHeadshots({ to: job.email, bird: job.bird, results: job.results }).catch((e) => console.error("[mail]", e.message));
  }
  job.photos = null; // drop the uploaded selfies once done
}

// 1) hold upload, assign hidden bird
app.post("/api/start", upload.array("photos", 2), async (req, res) => {
  try {
    if (!req.files || req.files.length < 2) return res.status(400).json({ error: "Please upload 2 photos — two different angles give the best likeness." });
    // convert HEIC → JPEG, then validate type + resolution (before assigning a bird)
    for (const f of req.files) {
      if (isHeic(f.buffer)) {
        try {
          f.buffer = Buffer.from(await heicConvert({ buffer: f.buffer, format: "JPEG", quality: 0.92 }));
          f.mimetype = "image/jpeg";
        } catch { return res.status(400).json({ error: "Couldn't read that HEIC photo — try exporting it as JPG." }); }
      }
      if (!/^image\/(jpe?g|png)$/.test(f.mimetype)) return res.status(400).json({ error: "Please upload a JPG, PNG, or HEIC photo." });
      const dim = imageDimensions(f.buffer);
      if (!dim) return res.status(400).json({ error: "Couldn't read that image — please use a standard JPG, PNG, or HEIC." });
      if (dim.width < MIN_IMAGE_DIM || dim.height < MIN_IMAGE_DIM) {
        return res.status(400).json({ error: `That photo is ${dim.width}×${dim.height}. Please use at least ${MIN_IMAGE_DIM}×${MIN_IMAGE_DIM} (1024×1024 or larger is best) for sharp results.` });
      }
    }
    const email = (req.body.email || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "Please enter a valid email address." });
    const consent = req.body.consent === "true";
    addEmail(email, consent);
    const bird = assignBird();
    const job = {
      id: randomUUID(), bird, email,
      photos: req.files.map((f) => ({ buffer: f.buffer, mimeType: f.mimetype })),
      paid: false, status: "awaiting_payment",
      total: LOOKS.length, done: 0, results: new Array(LOOKS.length).fill(null),
      rerollsUsed: 0, sessionId: null, createdAt: Date.now(),
    };
    jobs.set(job.id, job);
    res.json({ jobId: job.id, total: job.total, priceCents: PRICE_CENTS, paymentsEnabled: PAYMENTS_ENABLED });
  } catch (err) { console.error("[start]", err); res.status(500).json({ error: err.message }); }
});

// 2) checkout (or dev bypass)
app.post("/api/checkout", async (req, res) => {
  try {
    const job = jobs.get(req.body.jobId);
    if (!job) return res.status(404).json({ error: "Session expired — please re-upload." });
    const base = baseUrl(req);
    const code = (req.body.code || "").trim().toLowerCase();
    if (code && FREE_CODES.includes(code)) { // valid beta code → skip payment
      job.paid = true;
      return res.json({ url: `${base}/?job=${job.id}&paid=1&free=1` });
    }
    if (!PAYMENTS_ENABLED) return res.json({ url: `${base}/?job=${job.id}&paid=1&dev=1` });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: job.email || undefined, // pre-fill so they don't type it twice
      line_items: [{
        price_data: {
          currency: "usd", unit_amount: PRICE_CENTS,
          product_data: { name: "Headshots with a Bird — 3 headshots + your Bird ID" },
        }, quantity: 1,
      }],
      metadata: { jobId: job.id },
      success_url: `${base}/?job=${job.id}&paid=1`,
      cancel_url: `${base}/?job=${job.id}&canceled=1`,
    });
    job.sessionId = session.id;
    res.json({ url: session.url });
  } catch (err) { console.error("[checkout]", err); res.status(500).json({ error: err.message }); }
});

// 3) verify payment, start generation
app.get("/api/finalize/:jobId", async (req, res) => {
  try {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Session expired — please re-upload." });
    if (!job.paid) {
      if (!PAYMENTS_ENABLED) job.paid = true;
      else if (job.sessionId) {
        const s = await stripe.checkout.sessions.retrieve(job.sessionId);
        if (s.payment_status === "paid") job.paid = true;
      }
    }
    if (!job.paid) return res.json({ paid: false });
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
    if (job.status === "awaiting_payment") {
      if (peek(ip) >= DAILY_CAP) return res.status(429).json({ error: "Daily limit reached — try again tomorrow." });
      bump(ip); startGeneration(job);
    }
    res.json({ paid: true, bird: withBirdImage(job.bird), status: job.status, total: job.total });
  } catch (err) { console.error("[finalize]", err); res.status(500).json({ error: err.message }); }
});

// 4) poll
app.get("/api/job/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found or expired." });
  res.json({
    status: job.status, paid: job.paid, total: job.total, done: job.done,
    bird: job.paid ? withBirdImage(job.bird) : null,
    results: job.paid ? job.results : [],
    error: job.error,
  });
});

// ---- reviews ----
app.post("/api/review", async (req, res) => {
  try {
    const { jobId, stars, text, name, consent, featuredSrc } = req.body || {};
    if (wordCount(text) > 30) return res.status(400).json({ error: "Reviews are limited to 30 words." });
    const job = jobs.get(jobId);
    const bird = job?.bird || null;
    // prefer a server-known image; fall back to the src the client was viewing
    let src = featuredSrc || null;
    if (job?.results?.length) {
      const ok = job.results.find((r) => r && r.src && (!featuredSrc || r.src === featuredSrc));
      if (ok) src = ok.src;
    }
    const review = await addReview({ stars, text, name, bird, featuredSrc: src, consent });
    res.json({ ok: true, id: review.id });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get("/api/reviews", (_req, res) => res.json(listReviews({ approvedOnly: true })));

// ---- admin (curate which reviews go live) ----
function adminOk(req) { return ADMIN_KEY && (req.query.key === ADMIN_KEY || req.body?.key === ADMIN_KEY); }
app.get("/api/admin/reviews", (req, res) => {
  if (!adminOk(req)) return res.status(401).json({ error: "Unauthorized." });
  res.json(listReviews({ approvedOnly: false }));
});
app.post("/api/admin/approve", (req, res) => {
  if (!adminOk(req)) return res.status(401).json({ error: "Unauthorized." });
  try { res.json({ ok: true, review: setApproved(req.body.id, req.body.approved !== false) }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.get("/api/admin/emails", (req, res) => {
  if (!adminOk(req)) return res.status(401).json({ error: "Unauthorized." });
  res.json(listEmails());
});

app.get("/api/stats", (_req, res) => res.json(stats()));
app.get("/healthz", (_req, res) =>
  res.json({ ok: true, provider: (process.env.PROVIDER || "replicate").toLowerCase(), paymentsEnabled: PAYMENTS_ENABLED, priceCents: PRICE_CENTS, looks: LOOKS.length, gate: SIMILARITY_GATE, simThreshold: SIM_THRESHOLD, maxRerolls: MAX_REROLLS, ...stats() })
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🐦  instaheadshotswithabird running → http://localhost:${PORT}`);
  console.log(`    payments: ${PAYMENTS_ENABLED ? "Stripe ON" : "DEV BYPASS"} · $${(PRICE_CENTS / 100).toFixed(2)} · ${LOOKS.length} looks · admin ${ADMIN_KEY ? "ON" : "OFF"}`);
});
