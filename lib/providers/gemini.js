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

// gemini-2.5-flash-image-preview was retired by Google (2026-06): the preview
// alias 404s. The stable name is gemini-2.5-flash-image ("Nano Banana").
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-image";
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
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini error: ${data.error?.message || res.statusText}`);

  const outParts = data.candidates?.[0]?.content?.parts || [];
  const part = outParts.find((p) => p.inline_data || p.inlineData);
  const inline = part?.inline_data || part?.inlineData;
  if (!inline) throw new Error("Gemini returned no image — try clearer, front-facing selfies.");

  const mt = inline.mime_type || inline.mimeType || "image/png";
  return { src: `data:${mt};base64,${inline.data}` };
}
