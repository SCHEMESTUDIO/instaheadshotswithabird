// ============================================================
//  Gemini provider — Nano Banana image generation/editing.
//  PRIMARY provider: natively accepts MULTIPLE reference photos,
//  which is what makes 5–10 selfies improve likeness without any
//  per-user fine-tuning.
//
//  Docs: https://ai.google.dev/gemini-api/docs/image-generation
//  NOTE: confirm the current image model name and set GEMINI_MODEL.
//        Best identity fidelity with ~6 or fewer references.
//  Returns: { src }  (a base64 data URI)
// ============================================================

// Bake-off winner 2026-06-10 (see scripts/bakeoff/PLAN.md): Nano Banana 2 +
// preserve-expression prompt → 1/20 embarrassing failures vs 12-16/20 for
// gemini-2.5-flash-image. ~$0.067/img → 34% margin at $1.
// (gemini-2.5-flash-image-preview was retired by Google 2026-06 and 404s.)
const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-image";
const MAX_REFS = Number(process.env.GEMINI_MAX_REFS || 6);

export async function generate({ images, prompt }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set. Add it to your .env file.");
  if (!images?.length) throw new Error("No reference photos provided.");

  // Cap references for best fidelity (per Nano Banana Pro guidance).
  const refs = images.slice(0, MAX_REFS);
  const parts = [
    { text: prompt },
    ...refs.map((img) => ({
      inline_data: { mime_type: img.mimeType, data: img.buffer.toString("base64") },
    })),
  ];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      // Send the key in a header, NOT ?key=... in the URL: query-string secrets
      // leak into proxy/access logs, browser/Referer history, and error traces.
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
      // a hung request would otherwise stall its look forever (no error → no retry)
      signal: AbortSignal.timeout(120_000),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(`Gemini error: ${data.error?.message || res.statusText}`);
    err.status = res.status;
    // Surface the API's own retry hint so the caller can wait exactly as long
    // as asked instead of guessing: prefer the Retry-After header, fall back
    // to the google.rpc.RetryInfo detail ("retryDelay": "7s").
    const ra = Number(res.headers.get("retry-after"));
    if (Number.isFinite(ra) && ra > 0) err.retryAfterMs = ra * 1000;
    if (!err.retryAfterMs) {
      const delay = data.error?.details?.find((d) => d?.["@type"]?.includes("RetryInfo"))?.retryDelay;
      const m = /([\d.]+)\s*s/.exec(delay || "");
      if (m) err.retryAfterMs = Math.ceil(Number(m[1]) * 1000);
    }
    throw err;
  }

  const outParts = data.candidates?.[0]?.content?.parts || [];
  const part = outParts.find((p) => p.inline_data || p.inlineData);
  const inline = part?.inline_data || part?.inlineData;
  if (!inline) throw new Error("Gemini returned no image — try clearer, front-facing selfies.");

  const mt = inline.mime_type || inline.mimeType || "image/png";
  return { src: `data:${mt};base64,${inline.data}` };
}
