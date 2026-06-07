import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import Stripe from "stripe";
import fs from "fs";
import { buildPrompt, buildMultiPrompt, buildTwoPersonPrompt } from "./lib/prompt.js";
import { LOOKS } from "./lib/looks.js";
import { hasRef, refPath, refPublicUrl } from "./lib/birdref.js";
import { imageDimensions } from "./lib/imagesize.js";
import * as kontextMulti from "./lib/providers/kontext-multi.js";
import { assignBird, stats } from "./lib/assign.js";
import { getProvider } from "./lib/providers/index.js";
import { addReview, listReviews, setApproved, wordCount, MEDIA_DIR } from "./lib/reviews.js";

dotenv.config();

const PRICE_CENTS = Number(process.env.PRICE_CENTS || 100);
const DAILY_CAP = Number(process.env.DAILY_CAP || 20);
const CONCURRENCY = Number(process.env.CONCURRENCY || 1); // serial by default — respects Replicate's low-credit burst limit. Raise once credit > $5.
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const USE_BIRD_REF = process.env.USE_BIRD_REF !== "false"; // use the locked reference image when one exists
const MIN_IMAGE_DIM = Number(process.env.MIN_IMAGE_DIM || 768); // reject tiny uploads that produce bad results
const PAYMENTS_ENABLED = !!process.env.STRIPE_SECRET_KEY;
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

function withBirdImage(bird) {
  if (!bird) return bird;
  return { ...bird, image: hasRef(bird.id) ? refPublicUrl(bird.id) : null };
}

async function generateLook(job, look) {
  const photos = job.photos || [];
  const twoPerson = photos.length >= 2;                              // 2 selfies → better likeness
  const useRef = !twoPerson && USE_BIRD_REF && hasRef(job.bird.id);  // else lock the bird via reference image
  const mode = twoPerson ? "2-photo" : useRef ? "ref" : "single";
  const MAX_ATTEMPTS = 6;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      let src;
      if (twoPerson) {
        ({ src } = await kontextMulti.generateMulti({ imageA: photos[0], imageB: photos[1], prompt: buildTwoPersonPrompt(look, job.bird) }));
      } else if (useRef) {
        const birdImage = { buffer: fs.readFileSync(refPath(job.bird.id)), mimeType: "image/jpeg" };
        ({ src } = await kontextMulti.generateMulti({ imageA: photos[0], imageB: birdImage, prompt: buildMultiPrompt(look) }));
      } else {
        ({ src } = await getProvider().generate({ images: [photos[0]], prompt: buildPrompt(look, job.bird) }));
      }
      return { look: look.id, label: look.label, src };
    } catch (err) {
      lastErr = err;
      console.error(`[job ${job.id}] ${look.id} try ${attempt} (${mode}): ${err.message}`);
      if (attempt < MAX_ATTEMPTS) {
        const throttled = /throttle/i.test(err.message || "");
        await sleep(throttled ? throttleWaitMs(err.message) : 2500); // wait out rate limits before retrying
      }
    }
  }
  return { look: look.id, label: look.label, error: lastErr?.message || "Generation failed." };
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
  job.photos = null; // drop the uploaded selfies once done
}

// 1) hold upload, assign hidden bird
app.post("/api/start", upload.array("photos", 2), (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: "Please upload at least one selfie." });
    // validate type + resolution (server-side backstop)
    for (const f of req.files) {
      if (!/^image\/(jpe?g|png)$/.test(f.mimetype)) return res.status(400).json({ error: "Please upload JPG or PNG photos only." });
      const dim = imageDimensions(f.buffer);
      if (!dim) return res.status(400).json({ error: "Couldn't read that image — please use a standard JPG or PNG." });
      if (dim.width < MIN_IMAGE_DIM || dim.height < MIN_IMAGE_DIM) {
        return res.status(400).json({ error: `That photo is ${dim.width}×${dim.height}. Please use at least ${MIN_IMAGE_DIM}×${MIN_IMAGE_DIM} (1024×1024 or larger is best) for sharp results.` });
      }
    }
    const bird = assignBird();
    const job = {
      id: randomUUID(), bird,
      photos: req.files.map((f) => ({ buffer: f.buffer, mimeType: f.mimetype })),
      paid: false, status: "awaiting_payment",
      total: LOOKS.length, done: 0, results: new Array(LOOKS.length).fill(null),
      sessionId: null, createdAt: Date.now(),
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
    if (!PAYMENTS_ENABLED) return res.json({ url: `${base}/?job=${job.id}&paid=1&dev=1` });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd", unit_amount: PRICE_CENTS,
          product_data: { name: "InstaHeadshots with a Bird — 5 headshots + your Bird ID" },
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

app.get("/api/stats", (_req, res) => res.json(stats()));
app.get("/healthz", (_req, res) =>
  res.json({ ok: true, provider: (process.env.PROVIDER || "replicate").toLowerCase(), paymentsEnabled: PAYMENTS_ENABLED, priceCents: PRICE_CENTS, looks: LOOKS.length, ...stats() })
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🐦  instaheadshotswithabird running → http://localhost:${PORT}`);
  console.log(`    payments: ${PAYMENTS_ENABLED ? "Stripe ON" : "DEV BYPASS"} · $${(PRICE_CENTS / 100).toFixed(2)} · ${LOOKS.length} looks · admin ${ADMIN_KEY ? "ON" : "OFF"}`);
});
