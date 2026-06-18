# InstaHeadshots — Cost Review (2026-06-16)

Applied the `cost-aware-llm-pipeline` skill to the generation pipeline (`server.js`, `lib/providers/`, `lib/prompt.js`, `lib/looks.js`). The skill is written for *text* LLMs; this report adapts its four levers to your *image*-gen economics. Where a lever doesn't transfer, I say so — that's the more useful finding.

## Baseline (from README, unverified against live Stripe/Gemini invoices)

| Line | Amount | Share of revenue |
|---|---|---|
| Revenue | $1.00 | — |
| Stripe (2.9% + $0.30) | −$0.329 | 33% |
| Gemini (5 × ~$0.067) | −$0.335 | 34% |
| **Net** | **≈ $0.34** | **34%** |

Key structural fact: **Stripe and Gemini cost almost exactly the same**, and the single biggest line item is Stripe's **flat $0.30**, not the AI. That reframes where the money actually leaks. *(Confidence: High on the arithmetic; the $0.067/image is your stated bake-off figure, not re-verified against a live invoice.)*

---

## Which of the skill's 4 levers actually apply

| Skill lever | Applies here? | Why |
|---|---|---|
| **Model routing** (cheap model for easy tasks) | ❌ Mostly no | You pay a flat price per *output image*, not per input token. There's no "simpler" sub-task to route to a cheaper model — and you already ran a bake-off and chose the quality tier deliberately (13pts of margin for 1/20 vs 12–16/20 failures). That was the right call; don't undo it. |
| **Narrow retry** (retry only transient errors) | ✅ **Yes — real leak** | This is the one that bites. See Finding 1. |
| **Budget tracking / circuit breaker** | ✅ Yes — missing | No spend guardrail today. See Finding 2. |
| **Prompt caching** | ⚠️ Marginal | The ~200-word base prompt + 2 reference selfies are re-sent on all 5 calls. But with flat per-output-image pricing, cached input saves little to nothing. Low priority; verify before investing. |

**The lesson:** half the skill doesn't transfer, because it assumes token-metered text. Dropping it in blindly would have sent you chasing model-routing savings that don't exist. The value it *did* deliver is the retry leak and the missing budget guardrail below.

---

## Finding 1 — Retry-all-errors burns calls on deterministic failures *(highest code-level priority)*

`rawGenerate()` (`server.js:144–170`) retries **up to 6 times on *any* error**, including permanent ones:

- `"Gemini returned no image"` (`gemini.js`) — a **200 OK with no image part**. This is usually a *deterministic* outcome of a bad input (blurry selfie, safety block). Retrying it 6× re-runs the same doomed request 6×.
- A 400-class `BadRequestError` — will fail identically every time.

Why it matters for cost: a 200-with-no-image response is the kind of call providers typically **still bill** (the model ran). If so, one bad upload can cost you **6× a generation** instead of 1×, and with `CONCURRENCY` workers, a partial Gemini degradation could fan that out across looks.

**Fix (the skill's "narrow retry" pattern):** classify errors. Retry only `429 / 5xx / network / timeout` (you already extract `retryAfterMs` — good). Treat `"no image"` and `4xx` as fail-fast: 1 attempt, maybe 2, then surface to the user ("try clearer, front-facing selfies"). Your auto-refund-on-total-failure already covers the downside.

*Confidence: Medium.* The savings depend on whether Gemini bills 200-empty responses — **verify against one real invoice** before assuming a number. Even if they're free, fail-fast still cuts latency and frees concurrency slots, so the fix is worth it regardless.

---

## Finding 2 — No budget guardrail / circuit breaker

The skill's rule: *set explicit spend limits, fail early rather than overspend.* Today you have a per-IP/daily **request** cap and auto-refund, but **no dollar ceiling** on Gemini spend. A retry storm (Finding 1) or abuse spike can run up an API bill with nothing to stop it.

**Fix:** a simple daily image-count cap → estimated-spend ceiling; when exceeded, pause new generation (refund/queue) rather than keep calling. Pairs with the rate-limit you already have. *(Confidence: High that it's absent; Medium on urgency — depends on your current daily volume, which I didn't measure.)*

---

## Finding 3 — No cost observability

You log errors but not **cost/volume**. The skill's best practice: *log decisions so you can tune from real data.* Add a per-job `imagesGenerated` counter + a running daily estimate to the logs/admin endpoint. Cheap to add, and it's the prerequisite for tuning Findings 1, 2, and the pricing question below. *(Confidence: High.)*

---

## The biggest lever is pricing, not code *(out of the skill's scope, but I'd be hiding the ball not to say it)*

Stripe's flat **$0.30** is 30% of a $1 sale. It barely moves with order size, so it punishes the $1 price point specifically. Amortizing it is the single highest-margin action available:

- At **$1 / 5 images**: Stripe = $0.329 = **33%** of revenue.
- At **$3 / 15 images** (or a 3-session pack): Stripe = $0.30 + 2.9% = $0.387 = **~13%** of revenue.

Same product, the fixed fee's drag drops ~20 points. This is a pricing/packaging decision, not a code change — flagging it, not prescribing it, because it trades against your "$1 headshots" positioning. *(Confidence: High on the math.)*

What I would **not** do: drop from 5 looks to 4 to save $0.067. It lifts margin ~7pts but breaks the "5 looks" promise — wrong trade.

---

## Recommended order

1. **Finding 1** — narrow the retry logic. Real leak, contained change in `rawGenerate()`. *(I can implement this now.)*
2. **Finding 3** — add cost logging, so 1 and 2 become measurable.
3. **Finding 2** — add the daily spend ceiling.
4. **Pricing** — your call; the math says bundling is the real margin unlock.
5. **Verify** the $0.067/image and the "is 200-empty billed?" question against one real Gemini invoice before trusting any savings estimate.

---

## Implementation status — verified 2026-06-17

Re-read the live `server.js` against the three code findings above. **All three are implemented** (in the working tree, uncommitted):

- **Finding 1 (narrow retry):** `classifyGenError()` (server.js ~L191) buckets errors into `transient` / `noimage` / `client`; `rawGenerate()` retries transient up to 6×, gives `noimage` a single re-roll (`MAX_NOIMAGE_ATTEMPTS=2`), and fails fast on `client`. The retry-all leak is closed.
- **Finding 2 (budget guardrail):** `GLOBAL_DAILY_IMAGE_CAP` (~$20/day default) enforced pre-payment in `/api/start`, plus `GLOBAL_DAILY_CAP` and the per-IP cap.
- **Finding 3 (cost observability):** `spend` tracker (`recordAttempt`/`recordImage`), per-job `[cost]` log line in `startGeneration`, and a `/api/admin/cost` endpoint reporting images vs provider calls vs `wastedCalls`.

**Still open (your decisions, not code):** verify `EST_COST_PER_IMAGE` ($0.067) and the "is a 200-empty billed?" question against one real Gemini invoice; and the pricing/bundling lever (amortizing Stripe's flat $0.30), which remains the largest margin move and is deliberately not a code change.
