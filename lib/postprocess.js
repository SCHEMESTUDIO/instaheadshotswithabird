// ============================================================
//  Light post-processing to take the "AI sheen" off outputs.
//  - Contrast: a true percentage (CONTRAST_PCT, default 4%).
//  - Sharpen: a mild unsharp via a 3x3 convolution. There is no
//    standard "percent" for sharpening, so SHARPEN_K is a small
//    strength value (default 0.10 = subtle). Raise for more bite.
//  Pure-JS (jimp) so there's no native binary to fail on deploy.
// ============================================================

import Jimp from "jimp";

const CONTRAST = Number(process.env.CONTRAST_PCT ?? 4) / 100; // 0.04 = +4%
const SHARPEN_K = Number(process.env.SHARPEN_K ?? 0.1);       // subtle sharpen
const JPEG_QUALITY = Number(process.env.JPEG_QUALITY ?? 92);

export async function enhance(buffer) {
  const img = await Jimp.read(buffer);
  if (CONTRAST) img.contrast(CONTRAST); // jimp range -1..1
  if (SHARPEN_K) {
    const k = SHARPEN_K;
    img.convolute([
      [0, -k, 0],
      [-k, 1 + 4 * k, -k],
      [0, -k, 0],
    ]);
  }
  img.quality(JPEG_QUALITY);
  return img.getBufferAsync(Jimp.MIME_JPEG);
}
