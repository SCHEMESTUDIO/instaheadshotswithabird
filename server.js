import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import Stripe from "stripe";
import heicConvert from "heic-convert";
import { buildTwoPersonPrompt } from "./lib/prompt.js";
import { LOOKS } from "./lib/looks.js";
import { hasRef, refPublicUrl } from "./lib/birdref.js";
import { imageDimensions } from "./lib/imagesize.js";
import { assignBird, stats } from "./lib/assign.js";
import { getProvider } from "./lib/providers/index.js";
import { addReview, listReviews, setApproved, wordCount, MEDIA_DIR } from "./lib/reviews.js";
import { addEmail, listEmails } from "./lib/emails.js";
import { addProInterest, proInterestCount, listProInterest } from "./lib/prodoor.js";
import { sendHeadshots } from "./lib/mail.js";

dotenv.config();

const PRICE_CENTS = Number(process.env.PRICE_CENTS || 100);
const DAILY_CAP = Number(process.env.DAILY_CAP || 20);
// 5-way parallel: NB2 averages ~16s/render (T7), so serial = ~80s and breaks the
// "about a minute" promise; parallel ≈ 20s. The old serial default was only a
// Replicate low-credit constraint — set CONCURRENCY=1 if ever back on Replicate.
const CONCURRENCY = Number(process.env.CONCURRENCY || 5);
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const MIN_IMAGE_DIM = Number(process.env.MIN_IMAGE_DIM || 768); // reject tiny uploads that produce bad results
const EMAIL_DELAY_MS = Number(process.env.EMAIL_DELAY_MS || 3 * 60 * 1000); // window for the user's Bird-ID pick to reach the delivery email
const PAYMENTS_ENABLED = !!process.env.STRIPE_SECRET_KEY;
const FREE_CODES = (process.env.FREE_CODES || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean); // beta codes that skip payment
const stripe = PAYMENTS_ENABLED ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const app = express();
app.set("trust proxy", true); // honor x-forwarded-proto so Stripe redirect URLs are https behind a host's proxy
const upload = multer({ limits: { fileSize: 12 * 1024 * 1024, files: 2 } });

// ---- Stripe webhook (raw body) BEFORE express.json ----
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!PAYMENTS_ENABLED) return res.json({ ok: true, skipped: true });
  let event = req.body;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  try {
    if (secret) event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], secret);
    else event = JSON.parse(req.body.toString());
  } catch (err) { return res.status(400).send(`Webhook error: ${err.message}`); }
  if (event.type === "checkout.session.completed") {
    let session = event.data?.object;
    if (!secret) {
      // Unsigned payloads can be forged (free-generation bypass) — confirm the
      // session with Stripe before trusting it. Set STRIPE_WEBHOOK_SECRET to
      // skip this round-trip.
      try {
        if (!session?.id) throw new Error("no session id");
        session = await stripe.checkout.sessions.retrieve(session.id);
      } catch { return res.status(400).send("Unverifiable webhook payload"); }
      if (session.payment_status !== "paid") return res.json({ received: true });
    }
    const job = jobs.get(session?.metadata?.jobId);
    if (job && !job.paid) { job.paid = true; startGeneration(job); }
  }
  res.json({ received: true });
});

app.use(express.json({ limit: "12mb" })); // /api/card uploads the rendered Bird ID PNG (~2-4 MB)
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
// Purge rules: never drop a job mid-generation; unpaid jobs live 45 min
// (Stripe checkout below is capped at ~31 min, so the job outlives the
// payment window); paid jobs live 2 h so the success link keeps working
// for a while — the email delivery is the permanent copy.
const jobs = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (j.status === "generating") continue;
    const age = now - j.createdAt;
    if (!j.paid && age > 45 * 60 * 1000) jobs.delete(id);
    else if (j.paid && age > 2 * 60 * 60 * 1000) jobs.delete(id);
  }
}, 5 * 60 * 1000).unref?.();

function clientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
}

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

// One generation for a look: feed BOTH selfies + the text prompt (the assigned
// bird is described in the prompt) straight to Gemini. Retries through transient
// rate-limit errors; throws if every attempt fails. No post-processing, no gate.
async function rawGenerate(job, look) {
  const photos = job.photos || [];
  const MAX_ATTEMPTS = 6;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { src } = await getProvider().generate({ images: photos, prompt: buildTwoPersonPrompt(look, job.bird) });
      return src;
    } catch (err) {
      lastErr = err;
      console.error(`[job ${job.id}] ${look.id} try ${attempt}: ${err.message}`);
      if (attempt < MAX_ATTEMPTS) {
        const throttled = /throttle|rate/i.test(err.message || "");
        await sleep(throttled ? throttleWaitMs(err.message) : 2500); // wait out rate limits before retrying
      }
    }
  }
  throw lastErr || new Error("Generation failed.");
}

async function generateLook(job, look) {
  try {
    const src = await rawGenerate(job, look);
    return { look: look.id, label: look.label, src };
  } catch (err) {
    return { look: look.id, label: look.label, error: err.message || "Generation failed." };
  }
}

async function startGeneration(job) {
  if (job.status === "generating" || job.status === "complete") return;
  job.status = "generating";
  if (job.ip) bump(job.ip); // count against the daily cap when generation actually starts
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
    // Delay the delivery email so the user's Bird-ID photo pick (made on the
    // results page, uploaded via /api/card) can ride along. The browser posts
    // a default card (look 3) on completion, and re-posts if they pick another.
    setTimeout(() => {
      sendHeadshots({ to: job.email, bird: job.bird, results: job.results, card: job.cardPng })
        .catch((e) => console.error("[mail]", e.message));
    }, EMAIL_DELAY_MS).unref?.();
  }
  if (job.status === "failed") {
    // The UI promises "your $1 will be refunded" on total failure — honor it
    // automatically so nobody has to remember. Free-code jobs have no session.
    refundJob(job).catch((e) => console.error(`[refund] job ${job.id}:`, e.message));
  }
  job.photos = null; // drop the uploaded selfies once done
}

async function refundJob(job) {
  if (!PAYMENTS_ENABLED || !job.sessionId || job.refunded) return;
  const s = await stripe.checkout.sessions.retrieve(job.sessionId);
  if (s.payment_status !== "paid" || !s.payment_intent) return;
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent.id;
  await stripe.refunds.create({ payment_intent: pi });
  job.refunded = true;
  console.log(`[refund] job ${job.id}: refunded ${pi} (all ${LOOKS.length} looks failed)`);
}

// 1) hold upload, assign hidden bird
app.post("/api/start", upload.array("photos", 2), async (req, res) => {
  try {
    if (!req.files || req.files.length < 1) return res.status(400).json({ error: "Please upload at least one photo." });
    // enforce the daily cap BEFORE payment, not after — never charge someone we'll refuse
    const ip = clientIp(req);
    if (peek(ip) >= DAILY_CAP) return res.status(429).json({ error: "Daily limit reached — try again tomorrow." });
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
      id: randomUUID(), bird, email, ip,
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
    const code = (req.body.code || "").trim().toLowerCase();
    if (code) {
      if (FREE_CODES.includes(code)) { // valid beta code → skip payment
        job.paid = true;
        return res.json({ url: `${base}/?job=${job.id}&paid=1&free=1` });
      }
      // A typo'd code must NOT silently fall through to a $1 charge.
      return res.status(400).json({ error: "That beta code isn't valid — double-check it, or clear the field to pay $1." });
    }
    if (!PAYMENTS_ENABLED) return res.json({ url: `${base}/?job=${job.id}&paid=1&dev=1` });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // keep the payment window inside the job's 45-min lifetime so nobody can
      // pay for a job the server has already purged (Stripe minimum is 30 min)
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      customer_email: job.email || undefined, // pre-fill so they don't type it twice
      line_items: [{
        price_data: {
          currency: "usd", unit_amount: PRICE_CENTS,
          product_data: { name: "Headshots with a Bird — 5 headshots + your Bird ID" },
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
    // cap was already enforced (pre-payment) in /api/start; bump happens in startGeneration
    if (job.status === "awaiting_payment") startGeneration(job);
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

// Browser-rendered Bird ID card (PNG data URI) to attach to the delivery email.
// Posted automatically on completion (default look) and again on a user pick.
app.post("/api/card", (req, res) => {
  const job = jobs.get(req.body?.jobId);
  if (!job || !job.paid) return res.status(404).json({ error: "Job not found." });
  const png = req.body?.png || "";
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(png)) return res.status(400).json({ error: "Expected a PNG data URI." });
  if (png.length > 8 * 1024 * 1024) return res.status(400).json({ error: "Card too large." });
  job.cardPng = png;
  res.json({ ok: true });
});

// ---- reviews ----
app.post("/api/review", async (req, res) => {
  try {
    const { jobId, stars, text, name, consent, featuredSrc } = req.body || {};
    if (wordCount(text) > 30) return res.status(400).json({ error: "Reviews are limited to 30 words." });
    const job = jobs.get(jobId);
    const bird = job?.bird || null;
    // ONLY persist an image the server itself generated for this job. Anything
    // else would let an anonymous POST host arbitrary images on our domain
    // (or make the server fetch attacker-chosen URLs).
    let src = null;
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

// ---- Pro Pack fake door: log demand for the birdless $2.99 upsell ----
app.post("/api/pro-interest", (req, res) => {
  const job = jobs.get(req.body?.jobId);
  const n = addProInterest({ jobId: req.body?.jobId, email: job?.email || null });
  console.log(`[pro-door] click #${n} (job ${req.body?.jobId || "?"})`); // visible in Render logs
  res.json({ ok: true });
});
app.get("/api/admin/pro-interest", (req, res) => {
  if (!adminOk(req)) return res.status(401).json({ error: "Unauthorized." });
  res.json(listProInterest());
});

app.get("/api/stats", (_req, res) => res.json(stats()));
app.get("/healthz", (_req, res) =>
  res.json({
    ok: true, provider: (process.env.PROVIDER || "gemini").toLowerCase(),
    // resolved model — catches a stale GEMINI_MODEL env var silently overriding
    // the bake-off winner (this exact bug cost a real user run on 2026-06-10)
    model: process.env.GEMINI_MODEL || "gemini-3.1-flash-image (default)",
    paymentsEnabled: PAYMENTS_ENABLED, priceCents: PRICE_CENTS, looks: LOOKS.length,
    // config sanity flags — verify these say true before sharing with testers
    emailEnabled: !!process.env.RESEND_API_KEY,
    webhookSecretSet: !!process.env.STRIPE_WEBHOOK_SECRET,
    freeCodes: FREE_CODES.length,
    adminEnabled: !!ADMIN_KEY,
    proInterest: proInterestCount(), ...stats(),
  })
);

// Unknown paths: send humans home, give APIs a JSON 404 (never Express's HTML page)
app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found." });
  res.redirect("/");
});

// JSON error handler — keeps the API from ever returning Express's HTML 500 page
// (which the front-end can't parse as JSON). Catches multer upload errors etc.
app.use((err, _req, res, _next) => {
  console.error("[error]", err.code || "", err.message);
  const tooBig = err.code === "LIMIT_FILE_SIZE";
  const tooMany = err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE";
  res.status(tooBig || tooMany ? 400 : 500).json({
    error: tooBig ? "That photo is too large — please use one under 12 MB (export it at a smaller size and try again)."
      : tooMany ? "Please upload at most 2 photos."
      : "Something went wrong on our end — please try again.",
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🐦  instaheadshotswithabird running → http://localhost:${PORT}`);
  console.log(`    payments: ${PAYMENTS_ENABLED ? "Stripe ON" : "DEV BYPASS"} · $${(PRICE_CENTS / 100).toFixed(2)} · ${LOOKS.length} looks · admin ${ADMIN_KEY ? "ON" : "OFF"}`);
});
