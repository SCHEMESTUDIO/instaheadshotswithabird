// ============================================================
//  CodeFormer face-restoration pass (Replicate). ~$0.0055/image.
//  Sharpens faces and removes the AI "mush" / softness.
//  Non-fatal: returns the original image on any error.
// ============================================================

const MODEL = process.env.RESTORE_MODEL || "sczhou/codeformer";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function restoreFace(src) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token || !src) return src;
  const res = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "wait" },
    body: JSON.stringify({ input: { image: src, codeformer_fidelity: 0.9, background_enhance: true, face_upsample: true, upscale: 1 } }),
  });
  let p = await res.json();
  if (!res.ok) throw new Error(p.detail || p.error || res.statusText);
  while (p.status && p.status !== "succeeded" && p.status !== "failed" && p.urls?.get) {
    await sleep(1500);
    p = await (await fetch(p.urls.get, { headers: { Authorization: `Bearer ${token}` } })).json();
  }
  if (p.status === "failed" || p.error) throw new Error(p.error || "restore failed");
  const out = Array.isArray(p.output) ? p.output[0] : p.output;
  return out || src;
}
