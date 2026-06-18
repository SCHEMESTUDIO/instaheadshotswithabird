import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import Stripe from "stripe";
import heicConvert from "heic-convert";
import { buildTwoPersonPrompt } from "./lib/prompt.js";
import { LOOKS, looksForTier } from "./lib/looks.js";
import { hasRef, refPublicUrl } from "./lib/birdref.js";
import { imageDimensions } from "./lib/imagesize.js";
import { assignBird, stats } from "./lib/assign.js";
import { getProvider } from "./lib/providers/index.js";
import { addReview, listReviews, setApproved, wordCount, MEDIA_DIR } from "./lib/reviews.js";
import { addEmail, listEmails } from "./lib/emails.js";
import { addProInterest, proInterestCount, listProInterest } from "./lib/prodoor.js";
import { sendHeadshots } from "./lib/mail.js";
import { persistDelivery, DELIVERY_DIR } from "./lib/delivery.js";

dotenv.config();

const PRICE_CENTS = Number(process.env.PRICE_CENTS || 100);

// ---- pricing tiers: single source of truth for amount + product name ----
// Each maps to a look set in lib/looks.js via tasksForJob():
//   basic  → 5 looks (bird on) · full → 15 (bird on) · aviary → 30 (15 + 15 birdless)
// Amounts are overridable via env so prices can change without a code edit.
const TIERS = {
  basic:  { cents: Number(process.env.PRICE_BASIC_CENTS  || PRICE_CENTS), label: "Headshots with a Bird — 5 headshots + your Bird ID" },
  full:   { cents: Number(process.env.PRICE_FULL_CENTS   || 300),         label: "Headshots with a Bird — 15 headshots + your Bird ID" },
  aviary: { cents: Number(process.env.PRICE_AVIARY_CENTS || 1000),        label: "Headshots with a Bird — 30 headshots (15 + 15 birdless) + your Bird ID" },
};
function resolveTier(t) { return (t && TIERS[t]) ? t : "basic"; } // never trust a client tier blindly
const DAILY_CAP = Number(process.env.DAILY_CAP || 20);
// Global (all-IPs) daily job cap. Gemini Tier 1 allows 1,000 requests/day on
// the image model; a job is 5 calls + retries, so ~170 jobs/day stays safely
// under it. Enforced BEFORE payment so a viral day fails politely at upload
// instead of charging users and auto-refunding when the API quota runs dry.
const GLOBAL_DAILY_CAP = Number(process.env.GLOBAL_DAILY_CAP || 170);
// Image-weighted daily cap (all IPs). With mixed tiers a "job" is 5, 15, or 30
// images, so the job cap above no longer bounds image volume (= Gemini spend).
// This is the GRACEFUL limit: it trips at upload with a "back tomorrow" message
// BEFORE the hard Gemini monthly cap can fail a paid job mid-render. ~300 imgs
// ≈ $20/day at ~$0.067/img — tune to taste / your monthly budget.
const GLOBAL_DAILY_IMAGE_CAP = Number(process.env.GLOBAL_DAILY_IMAGE_CAP || 300);
// Max simultaneous Gemini calls across ALL jobs (per-job CONCURRENCY below
// only bounds one job). 15 in-flight ≈ 3 jobs at full parallelism; at ~16s
// per render that's ~56 requests/min, comfortably under the 100 RPM limit.
const GLOBAL_CONCURRENCY = Number(process.env.GLOBAL_CONCURRENCY || 15);
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
    if (job && !job.paid) {
      if (session?.metadata?.tier) job.tier = resolveTier(session.metadata.tier); // trust what Stripe recorded
      job.paid = true; startGeneration(job);
    }
  }
  res.json({ received: true });
});

app.use(express.json({ limit: "12mb" })); // /api/card uploads the rendered Bird ID PNG (~2-4 MB)
app.use("/review-media", express.static(MEDIA_DIR));
app.use("/delivery-media", express.static(DELIVERY_DIR)); // hosted headshot downloads linked from the email
app.use(express.static("public"));

function baseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

// ---- daily caps on actual generations (per-IP + global) ----
const counts = new Map();
let globalCount = 0;
let resetAt = nextMidnight();
function nextMidnight() { const d = new Date(); d.setHours(24, 0, 0, 0); return d.getTime(); }
let imagesToday = 0; // planned images committed today (image-weighted cap)
function rollover() {
  if (Date.now() > resetAt) {
    counts.clear(); globalCount = 0; imagesToday = 0;
    spend.attempts = 0; spend.images = 0; spend.dayStart = Date.now();
    resetAt = nextMidnight();
  }
}
function peek(ip) { rollover(); return counts.get(ip) || 0; }
function peekGlobal() { rollover(); return globalCount; }
function peekImages() { rollover(); return imagesToday; }
function bump(ip) { counts.set(ip, (counts.get(ip) || 0) + 1); globalCount++; }
function addImages(n) { imagesToday += n; } // called when a job actually starts generating

// ---- generation cost tracking (resets daily alongside the caps above) ----
// Estimate only. `attempts` = every billable provider call (incl. retries and
// possibly-billed empties — an UPPER bound on spend). `images` = calls that
// returned an actual image (a LOWER bound). Real cost sits between the two.
// Tune EST_COST_PER_IMAGE from real Gemini/Replicate invoices.
const EST_COST_PER_IMAGE = Number(process.env.EST_COST_PER_IMAGE || 0.067);
const spend = { attempts: 0, images: 0, dayStart: Date.now() };
function recordAttempt() { rollover(); spend.attempts++; }
function recordImage() { spend.images++; }

// ---- global concurrency gate on Gemini calls ----
// Jobs paid during a burst all call startGeneration at once; without this,
// N simultaneous jobs fire N×CONCURRENCY requests in the same second and
// trip the per-minute rate limit, burning retry budget on self-inflicted 429s.
let inFlight = 0;
const waiters = [];
async function withSlot(fn) {
  while (inFlight >= GLOBAL_CONCURRENCY) await new Promise((r) => waiters.push(r));
  inFlight++;
  try { return await fn(); } finally { inFlight--; waiters.shift()?.(); }
}

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

// Classify a generation error so we don't pay to repeat a doomed call.
// Image gen bills per OUTPUT image, so retrying a deterministic failure 6×
// just burns money. Three buckets:
//   "transient" — infra flake (429 / 5xx / timeout / network / throttle). Retry freely.
//   "noimage"   — model ran but declined to return an image (200-OK empty, or a
//                 "failed" prediction). Stochastic, so worth ONE re-roll, not six.
//   "client"    — deterministic (4xx, missing key, bad input, unknown). Fail fast.
// NOTE: the Gemini provider sets err.status; the Replicate fallback does not, so
// for Replicate we lean on the message text.
function classifyGenError(err) {
  if (err?.retryAfterMs) return "transient";          // API told us exactly how long to wait
  const s = Number(err?.status);
  if (s === 429 || (s >= 500 && s <= 599)) return "transient";
  if (s >= 400 && s <= 499) return "client";          // 400/401/403/404/422 — deterministic
  const msg = (err?.message || "").toLowerCase();
  if (err?.name === "AbortError"
      || /timeout|timed out|fetch failed|network|socket|econn|enotfound|eai_again/.test(msg)
      || /throttl|rate.?limit|too many requests|quota|resets in|temporarily/.test(msg)) {
    return "transient";
  }
  if (/returned no image|no image|generation failed/.test(msg)) return "noimage";
  return "client";                                    // missing key / bad input / unknown → don't pay to repeat it
}

// One generation for a look: feed BOTH selfies + the text prompt (the assigned
// bird is described in the prompt) straight to Gemini. Retries transient infra
// errors with backoff, gives a stochastic "no image" a single re-roll, and fails
// fast on deterministic errors so a bad upload can't bill 6× generations.
async function rawGenerate(job, look, includeBird = true) {
  const photos = job.photos || [];
  const MAX_TRANSIENT_ATTEMPTS = 6; // infra flakes: 429 / 5xx / timeout / network
  const MAX_NOIMAGE_ATTEMPTS = 2;   // model declined: one re-roll, not six
  let lastErr;
  let attempt = 0, transientTries = 0, noImageTries = 0;
  for (;;) {
    attempt++;
    try {
      // count every provider call as a billable attempt (upper bound on spend)
      job.genAttempts = (job.genAttempts || 0) + 1;
      recordAttempt();
      // hold a global slot only while the request is actually in flight —
      // never while sleeping out a backoff
      const { src } = await withSlot(() =>
        getProvider().generate({ images: photos, prompt: buildTwoPersonPrompt(look, job.bird, { includeBird }) })
      );
      job.genImages = (job.genImages || 0) + 1; // returned an actual image (lower bound)
      recordImage();
      return src;
    } catch (err) {
      lastErr = err;
      const kind = classifyGenError(err);
      console.error(`[job ${job.id}] ${look.id} try ${attempt} (${kind}): ${err.message}`);
      if (kind === "client") break;                   // deterministic — stop, don't re-bill it
      if (kind === "noimage") {
        if (++noImageTries >= MAX_NOIMAGE_ATTEMPTS) break;
        await sleep(1500);                            // brief pause, then a single re-roll
        continue;
      }
      // transient
      if (++transientTries >= MAX_TRANSIENT_ATTEMPTS) break;
      // prefer the API's own Retry-After/RetryInfo hint over our guesses
      const wait = err.retryAfterMs ? err.retryAfterMs + 1000
        : /throttl|rate|resets in/i.test(err.message || "") ? throttleWaitMs(err.message)
        : 2500;
      await sleep(wait);
    }
  }
  throw lastErr || new Error("Generation failed.");
}

// A task is { look, birdless }. Birdless variants get a distinct key (so the
// download filename doesn't collide with the bird-on version) and a clear label.
async function generateLook(job, task) {
  const { look, birdless } = task;
  const key = birdless ? `${look.id}-nobird` : look.id;
  const label = birdless ? `${look.label} · No bird` : look.label;
  try {
    const src = await rawGenerate(job, look, !birdless);
    return { look: key, label, src };
  } catch (err) {
    return { look: key, label, error: err.message || "Generation failed." };
  }
}

// Build the generation work list for a job from its tier.
//   basic  ($1)  → 5 looks, bird on
//   full   ($3)  → 15 looks, bird on
//   aviary ($10) → 15 bird-on + the same 15 birdless = 30 images
// Defaults to basic when job.tier is unset, so the live product is unchanged
// until checkout starts passing a tier through (set job.tier from Stripe
// metadata to activate $3/$10 — that's the one remaining hook).
function tasksForJob(job) {
  const tier = job.tier || "basic";
  const looks = looksForTier(tier);
  const tasks = looks.map((look) => ({ look, birdless: false }));
  if (tier === "aviary" || tier === "premium_plus") {
    for (const look of looks) tasks.push({ look, birdless: true });
  }
  return tasks;
}

async function startGeneration(job) {
  if (job.status === "generating" || job.status === "complete") return;
  // Build the work list and size the results array up front (synchronously,
  // before any await) so /api/finalize reports the correct total for this tier.
  const tasks = tasksForJob(job);
  job.total = tasks.length;
  if (!Array.isArray(job.results) || job.results.length !== tasks.length) {
    job.results = new Array(tasks.length).fill(null);
  }
  job.status = "generating";
  if (job.ip) bump(job.ip); // count against the daily JOB cap when generation actually starts
  addImages(tasks.length); // and against the image-weighted daily cap
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const i = cursor++;
      job.results[i] = await generateLook(job, tasks[i]);
      job.done++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));
  job.status = job.results.every((r) => r?.error) ? "failed" : "complete";
  // Per-job cost line (visible in Render logs). attempts ≥ images when retries
  // or billed empties happened — a gap here is the Finding-1 leak showing up.
  const ja = job.genAttempts || 0, ji = job.genImages || 0;
  console.log(`[cost] job ${job.id}: ${job.status} · ${ji}/${tasks.length} images · ${ja} provider calls · ~$${(ja * EST_COST_PER_IMAGE).toFixed(3)} (today: ${spend.images} imgs / ${spend.attempts} calls / ~$${(spend.attempts * EST_COST_PER_IMAGE).toFixed(2)})`);
  if (job.status === "complete" && job.email) {
    // Delay the delivery email so the user's Bird-ID photo pick (made on the
    // results page, uploaded via /api/card) can ride along. The browser posts
    // a default card (look 3) on completion, and re-posts if they pick another.
    setTimeout(async () => {
      try {
        // Persist images (R2 if configured, else disk) and email DOWNLOAD LINKS
        // — not 30 inline attachments, which Gmail/Yahoo silently drop.
        // persistDelivery returns absolute URLs ready for the email.
        const { images, cardUrl } = await persistDelivery(job.id, job.results, job.cardPng);
        await sendHeadshots({ to: job.email, bird: job.bird, images, cardUrl });
      } catch (e) { console.error("[mail]", e.message); }
    }, EMAIL_DELAY_MS).unref?.();
  }
  // Refund for any look we couldn't deliver. All failed → full refund (the UI's
  // "your money will be refunded" promise). SOME failed (e.g. the Gemini cap
  // tripped mid-job) → proportional refund so a paid customer never overpays for
  // a partial set. Free-code jobs have no session and are skipped inside.
  const failed = job.results.filter((r) => r?.error).length;
  if (failed > 0) {
    refundJob(job, failed, job.total).catch((e) => console.error(`[refund] job ${job.id}:`, e.message));
  }
  job.photos = null; // drop the uploaded selfies once done
}

async function refundJob(job, failedCount = job.total, totalCount = job.total) {
  if (!PAYMENTS_ENABLED || !job.sessionId || job.refunded) return;
  const s = await stripe.checkout.sessions.retrieve(job.sessionId);
  if (s.payment_status !== "paid" || !s.payment_intent) return;
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent.id;
  const full = failedCount >= totalCount || !totalCount;
  // refund the proportional value of the undelivered looks (rounded to cents)
  const amount = full ? undefined : Math.round((s.amount_total || 0) * failedCount / totalCount);
  if (!full && amount <= 0) return; // nothing meaningful to refund
  await stripe.refunds.create(full ? { payment_intent: pi } : { payment_intent: pi, amount });
  job.refunded = true;
  console.log(`[refund] job ${job.id}: ${full ? "full refund" : "$" + (amount / 100).toFixed(2) + " (" + failedCount + "/" + totalCount + " looks failed)"} on ${pi}`);
}

// 1) hold upload, assign hidden bird
app.post("/api/start", upload.array("photos", 2), async (req, res) => {
  try {
    if (!req.files || req.files.length < 1) return res.status(400).json({ error: "Please upload at least one photo." });
    // enforce the daily caps BEFORE payment, not after — never charge someone we'll refuse
    const ip = clientIp(req);
    if (peek(ip) >= DAILY_CAP) return res.status(429).json({ error: "Daily limit reached — try again tomorrow." });
    if (peekGlobal() >= GLOBAL_DAILY_CAP) {
      console.warn(`[cap] global daily cap hit (${GLOBAL_DAILY_CAP}) — refusing new jobs until midnight`);
      return res.status(429).json({ error: "We're at capacity today — the bird needs to rest. Please come back tomorrow!" });
    }
    // image-weighted cap — gate on this job's planned image count (tier-dependent)
    const tier = resolveTier((req.body.tier || "").trim());
    const jobImages = tasksForJob({ tier }).length;
    if (peekImages() + jobImages > GLOBAL_DAILY_IMAGE_CAP) {
      console.warn(`[cap] image cap would exceed ${GLOBAL_DAILY_IMAGE_CAP} (today ${peekImages()} + ${jobImages}) — refusing`);
      return res.status(429).json({ error: "We're at capacity today — the birds need a rest. Please come back tomorrow!" });
    }
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
      id: randomUUID(), bird, email, ip, tier,
      photos: req.files.map((f) => ({ buffer: f.buffer, mimeType: f.mimetype })),
      paid: false, status: "awaiting_payment",
      total: LOOKS.length, done: 0, results: new Array(LOOKS.length).fill(null),
      sessionId: null, createdAt: Date.now(),
    };
    jobs.set(job.id, job);
    res.json({ jobId: job.id, total: job.total, priceCents: PRICE_CENTS, paymentsEnabled: PAYMENTS_ENABLED });
  } catch (err) { console.error("[start]", err); res.status(500).json({ error: "Something went wrong on our end — please try again." }); }
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

    const tier = resolveTier(job.tier);
    const t = TIERS[tier];
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // keep the payment window inside the job's 45-min lifetime so nobody can
      // pay for a job the server has already purged (Stripe minimum is 30 min)
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      customer_email: job.email || undefined, // pre-fill so they don't type it twice
      line_items: [{
        price_data: {
          currency: "usd", unit_amount: t.cents, // server-derived from the tier — client can't underpay
          product_data: { name: t.label },
        }, quantity: 1,
      }],
      metadata: { jobId: job.id, tier },
      success_url: `${base}/?job=${job.id}&paid=1`,
      cancel_url: `${base}/?job=${job.id}&canceled=1`,
    });
    job.sessionId = session.id;
    res.json({ url: session.url });
  } catch (err) { console.error("[checkout]", err); res.status(500).json({ error: "Couldn't start checkout — please try again." }); }
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
        if (s.payment_status === "paid") {
          job.paid = true;
          if (s.metadata?.tier) job.tier = resolveTier(s.metadata.tier); // reconcile from Stripe
        }
      }
    }
    if (!job.paid) return res.json({ paid: false });
    // cap was already enforced (pre-payment) in /api/start; bump happens in startGeneration
    if (job.status === "awaiting_payment") startGeneration(job);
    res.json({ paid: true, bird: withBirdImage(job.bird), status: job.status, total: job.total });
  } catch (err) { console.error("[finalize]", err); res.status(500).json({ error: "Something went wrong on our end — please try again." }); }
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

// ---- admin: today's generation spend estimate ----
// attempts = upper bound (every billable call incl. retries/empties);
// images = lower bound (calls that returned an image). Real cost is between.
app.get("/api/admin/cost", (req, res) => {
  if (!adminOk(req)) return res.status(401).json({ error: "Unauthorized." });
  rollover();
  const lo = spend.images * EST_COST_PER_IMAGE;
  const hi = spend.attempts * EST_COST_PER_IMAGE;
  res.json({
    sinceDayStart: new Date(spend.dayStart).toISOString(),
    resetsAt: new Date(resetAt).toISOString(),
    estCostPerImage: EST_COST_PER_IMAGE,
    imagesReturned: spend.images,
    providerCalls: spend.attempts,
    wastedCalls: spend.attempts - spend.images, // retries + billed empties (the Finding-1 signal)
    estCostUsd: { low: Number(lo.toFixed(2)), high: Number(hi.toFixed(2)) },
  });
});

app.get("/api/stats", (_req, res) => res.json(stats()));
app.get("/healthz", (_req, res) =>
  res.json({
    ok: true, provider: (process.env.PROVIDER || "gemini").toLowerCase(),
    // resolved model — catches a stale GEMINI_MODEL env var silently overriding
    // the bake-off winner (this exact bug cost a real user run on 2026-06-10)
    model: process.env.GEMINI_MODEL || "gemini-3.1-flash-image (default)",
    paymentsEnabled: PAYMENTS_ENABLED, priceCents: PRICE_CENTS, looks: LOOKS.length,
    tiers: Object.fromEntries(Object.entries(TIERS).map(([k, v]) => [k, v.cents])),
    // config sanity flags — verify these say true before sharing with testers
    emailEnabled: !!process.env.RESEND_API_KEY,
    webhookSecretSet: !!process.env.STRIPE_WEBHOOK_SECRET,
    freeCodes: FREE_CODES.length,
    adminEnabled: !!ADMIN_KEY,
    // spike-protection counters (Gemini Tier 1: 100 RPM, 1K requests/day)
    jobsToday: peekGlobal(), globalDailyCap: GLOBAL_DAILY_CAP,
    geminiInFlight: inFlight, globalConcurrency: GLOBAL_CONCURRENCY,
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
