// ============================================================
//  Replicate provider — Flux Kontext (instruction-following editor).
//  FALLBACK ONLY. Flux Kontext takes a SINGLE input image, so it
//  cannot fuse multiple selfies — it uses the first photo only and
//  ignores the rest. Use Gemini (PROVIDER=gemini) for true
//  multi-selfie accuracy.
//
//  Docs: https://replicate.com/black-forest-labs/flux-kontext-pro/api
//  Returns: { src }  (a hosted image URL)
// ============================================================

const MODEL = process.env.REPLICATE_MODEL || "black-forest-labs/flux-kontext-pro";

async function poll(url, token, tries = 60) {
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const p = await r.json();
    if (p.status === "succeeded" || p.status === "failed" || p.status === "canceled") return p;
  }
  throw new Error("Replicate timed out waiting for the bird.");
}

export async function generate({ images, prompt }) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN is not set. Add it to your .env file.");
  if (!images?.length) throw new Error("No reference photos provided.");

  // Single-image model: use the first selfie only.
  const img = images[0];
  const imageDataUri = `data:${img.mimeType};base64,${img.buffer.toString("base64")}`;

  const res = await fetch(
    `https://api.replicate.com/v1/models/${MODEL}/predictions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        input: {
          prompt,
          input_image: imageDataUri,
          aspect_ratio: "1:1",
          output_format: "jpg",
          safety_tolerance: 2,
        },
      }),
    }
  );

  let prediction = await res.json();
  if (!res.ok) {
    throw new Error(`Replicate error: ${prediction.detail || prediction.error || res.statusText}`);
  }
  if (prediction.status !== "succeeded" && prediction.urls?.get) {
    prediction = await poll(prediction.urls.get, token);
  }
  if (prediction.status === "failed" || prediction.error) {
    throw new Error(`Replicate generation failed: ${prediction.error || "unknown error"}`);
  }

  const output = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!output) throw new Error("Replicate returned no image (status: " + prediction.status + ").");
  return { src: output };
}
