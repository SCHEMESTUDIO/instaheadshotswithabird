// ============================================================
//  Emails the user their finished headshots (via Resend).
//  Sends DOWNLOAD LINKS, not inline attachments — a big multi-
//  attachment message from a young domain gets silently dropped
//  by Gmail/Yahoo even when Resend says "delivered". A tiny
//  links-only email lands reliably at every tier (5/15/30).
//  Images are persisted by lib/delivery.js; we just link them.
//  Requires RESEND_API_KEY + a verified sender domain (EMAIL_FROM)
//  with SPF + DKIM + DMARC. Silently no-ops if the key isn't set.
// ============================================================

export async function sendHeadshots({ to, bird, images, cardUrl, cleanUrl }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  const from = process.env.EMAIL_FROM || "Headshots with a Bird <noreply@headshotswithabird.com>";

  const list = (images || []).filter((im) => im && im.url);
  const rows = list
    .map(
      (im, i) =>
        `<tr><td style="padding:5px 0"><a href="${im.url}" style="color:#0D7A5C;text-decoration:none;font-weight:bold">${im.label || `Headshot ${i + 1}`}</a></td></tr>`
    )
    .join("");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#121212;max-width:560px">
      <h2 style="margin:0 0 8px">Your headshots are ready.</h2>
      <p style="margin:0 0 12px">Every one includes your bird — a <strong>${bird?.name || "bird"}</strong>. That part was never in question. Download each one below.</p>
      <table style="border-collapse:collapse;margin:0 0 14px">${rows}</table>
      ${cleanUrl ? `<p style="margin:0 0 6px"><a href="${cleanUrl}" style="color:#0D7A5C;font-weight:bold;text-decoration:none">Your bird-free pick</a> — the one shot you chose to de-bird. Final.</p>` : ""}
      ${cardUrl ? `<p style="margin:0 0 14px"><a href="${cardUrl}" style="color:#0D7A5C;font-weight:bold;text-decoration:none">Your shareable Bird ID card</a></p>` : ""}
      <p style="margin:0 0 12px;color:#8C877B;font-size:13px">Save these soon — the download links don't stay live forever.</p>
      <p style="margin:16px 0 0;color:#8C877B;font-size:12px">headshotswithabird.com</p>
    </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: "Your Headshots with a Bird", html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
