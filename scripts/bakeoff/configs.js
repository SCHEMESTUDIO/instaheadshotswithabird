// ============================================================
//  BAKE-OFF TEST CONFIGS — one entry per test in PLAN.md.
//  Each test answers ONE question. Edit model strings here only;
//  run.js sets the env override before loading the provider, so
//  production code paths are exercised exactly as deployed.
// ============================================================

export const CONFIGS = [
  {
    id: "T1",
    label: "Baseline — exactly what's in prod",
    question: "What is today's embarrassing-failure rate?",
    provider: "gemini",
    model: "gemini-2.5-flash-image", // Nano Banana, stable (~$0.04/img → 47% margin @ $1)
    photos: 2,
    genCost: 0.04,
  },
  {
    id: "T2",
    label: "One photo instead of two",
    question: "Does 1 photo beat 2? (same model, same prompt)",
    provider: "gemini",
    model: "gemini-2.5-flash-image",
    photos: 1,
    genCost: 0.04,
  },
  {
    id: "T3",
    label: "Nano Banana 2 (Gemini 3.1 Flash Image)",
    question: "Does NB2 cut failures enough to give up 13pts of margin @ $1?",
    provider: "gemini",
    model: "gemini-3.1-flash-image", // ~$0.067/img → 34% margin @ $1, 65% @ $1.99
    // Set to whichever photo count won T1 vs T2 before running.
    photos: 2,
    genCost: 0.067,
  },
  {
    id: "T6",
    label: "Nano Banana Pro (Gemini 3 Pro Image) — $1.99 tier only",
    question: "Is quality MAJORLY better, enough to justify raising price to $1.99?",
    provider: "gemini",
    model: "gemini-3-pro-image", // ~$0.134/img → ~0% margin @ $1 (DEAD), 48% @ $1.99
    photos: 2,
    genCost: 0.134,
  },
  {
    id: "T4",
    label: "Flux Kontext Pro (Replicate)",
    question: "Does the cross-vendor identity-preservation leader beat Gemini?",
    provider: "replicate",
    model: "black-forest-labs/flux-kontext-pro",
    photos: 1, // single-image model — 2-photo fusion isn't supported on this path
    genCost: 0.08,
  },
  {
    id: "T5",
    label: "Qwen image edit (optional)",
    question: "Is the open-model option competitive on quality and price?",
    provider: "replicate",
    // FILL ME IN: confirm the current model slug on replicate.com
    // (search "qwen image edit") before running.
    model: "FILL_ME_IN",
    photos: 1,
    genCost: 0.03,
  },
];
