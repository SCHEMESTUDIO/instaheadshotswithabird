// ============================================================
//  Object storage — Cloudflare R2 (S3-compatible) for durable,
//  permanent delivery-image hosting. R2 has zero egress fees,
//  ideal for image downloads. Uploads are signed with SigV4 via
//  aws4fetch (same lib the rest of the Scheme stack uses); the
//  dependency is imported lazily so the app still runs (disk
//  fallback) when R2 isn't configured.
//
//  Required env for R2:
//    R2_ACCOUNT_ID         Cloudflare account id
//    R2_BUCKET             bucket name
//    R2_ACCESS_KEY_ID      R2 API token access key
//    R2_SECRET_ACCESS_KEY  R2 API token secret
//    R2_PUBLIC_BASE        public URL base for the bucket
//                          (custom domain or pub-xxxx.r2.dev), no trailing slash
// ============================================================

const ACCOUNT = process.env.R2_ACCOUNT_ID;
const BUCKET = process.env.R2_BUCKET;
const KEY = process.env.R2_ACCESS_KEY_ID;
const SECRET = process.env.R2_SECRET_ACCESS_KEY;
const PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(/\/$/, "");

export function r2Enabled() {
  return !!(ACCOUNT && BUCKET && KEY && SECRET && PUBLIC_BASE);
}

let _client;
async function client() {
  if (!_client) {
    const { AwsClient } = await import("aws4fetch"); // lazy — only loaded when R2 is used
    _client = new AwsClient({ accessKeyId: KEY, secretAccessKey: SECRET, service: "s3", region: "auto" });
  }
  return _client;
}

// Upload a buffer to R2 and return its permanent public URL. Throws on failure.
export async function uploadToR2(key, buf, contentType = "application/octet-stream") {
  const c = await client();
  const path = key.split("/").map(encodeURIComponent).join("/");
  const endpoint = `https://${ACCOUNT}.r2.cloudflarestorage.com/${BUCKET}/${path}`;
  const res = await c.fetch(endpoint, {
    method: "PUT",
    body: buf,
    headers: { "Content-Type": contentType },
  });
  if (!res.ok) throw new Error(`R2 ${res.status}: ${await res.text().catch(() => "")}`);
  return `${PUBLIC_BASE}/${key}`;
}
