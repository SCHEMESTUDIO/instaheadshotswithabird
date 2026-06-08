// ============================================================
//  Face-similarity scoring via Replicate apna-mart/face-match
//  (InsightFace buffalo_l / ArcFace under the hood).
//
//  Compares two images and returns a 0–1 similarity score plus
//  how many faces were detected in each. Used by the re-roll
//  quality gate to catch uncanny / wrong-person renders before
//  the user ever sees them.
//
//  NON-FATAL by design: returns null on any error or if scoring
//  can't run, so a flaky scorer never blocks delivery.
//
//  Runs on Replicate CPU (cheap, ~fractions of a cent), but the
//  model scales to zero so the first call after idle pays a
//  cold-start (tens of seconds). Subsequent calls are quick.
// ============================================================

// Community model → the /predictions endpoint needs the full version id.
const VERSION =
  process.env.FACEMATCH_VERSION ||
  "83e4bb4ade81e81bbaaf8d7b33db30b93688407c2c2d2d1010a0bff378e62a3a";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// image1 / image2: HTTP URLs or data URLs.
// Returns { score, faces1, faces2, isMatch } or null on any failure.
export async function faceSimilarity(image1, image2) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token || !image1 || !image2) return null;
  try {
    const res = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({ version: VERSION, input: { image1, image2 } }),
    });
    let p = await res.json();
    if (!res.ok) throw new Error(p.detail || p.error || res.statusText);
    while (
      p.status &&
      p.status !== "succeeded" &&
      p.status !== "failed" &&
      p.status !== "canceled" &&
      p.urls?.get
    ) {
      await sleep(1500);
      p = await (await fetch(p.urls.get, { headers: { Authorization: `Bearer ${token}` } })).json();
    }
    if (p.status !== "succeeded" || !p.output) return null;
    const out = p.output;
    const score = out?.similarity?.score;
    return {
      score: typeof score === "number" ? score : null,
      faces1: out?.image1?.faces_detected,
      faces2: out?.image2?.faces_detected,
      isMatch: out?.is_match ?? null,
    };
  } catch (e) {
    console.error("[similarity]", e.message);
    return null;
  }
}
