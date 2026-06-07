// ============================================================
//  Replicate FLUX.1 Kontext multi-image — combines TWO images:
//  image 1 = the person's selfie, image 2 = the bird reference.
//  This is what locks the bird to a fixed, verified picture.
//  Docs: https://replicate.com/flux-kontext-apps/multi-image-kontext-max
//
//  If the input parameter names differ, override via env:
//    REPLICATE_IMG1_KEY / REPLICATE_IMG2_KEY
//  Returns: { src } (hosted image URL)
// ============================================================

const MODEL = process.env.REPLICATE_MULTI_MODEL || "flux-kontext-apps/multi-image-kontext-max";
const KEY1 = process.env.REPLICATE_IMG1_KEY || "input_image_1";
const KEY2 = process.env.REPLICATE_IMG2_KEY || "input_image_2";

const dataUri = (img) => `data:${img.mimeType};base64,${img.buffer.toString("base64")}`;

async function poll(url, token, tries = 60) {
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const p = await r.json();
    if (p.status === "succeeded" || p.status === "failed" || p.status === "canceled") return p;
  }
  throw new Error("Replicate timed out.");
}

export async function generateMulti({ imageA, imageB, prompt }) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN is not set.");

  const res = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "wait" },
    body: JSON.stringify({
      input: {
        prompt,
        [KEY1]: dataUri(imageA),
        [KEY2]: dataUri(imageB),
        aspect_ratio: "1:1",
        output_format: "jpg",
        safety_tolerance: 2,
      },
    }),
  });

  let p = await res.json();
  if (!res.ok) throw new Error(`Replicate error: ${p.detail || p.error || res.statusText}`);
  if (p.status !== "succeeded" && p.urls?.get) p = await poll(p.urls.get, token);
  if (p.status === "failed" || p.error) throw new Error(`Replicate generation failed: ${p.error || "unknown"}`);

  const output = Array.isArray(p.output) ? p.output[0] : p.output;
  if (!output) throw new Error("Replicate returned no image (status: " + p.status + ").");
  return { src: output };
}
