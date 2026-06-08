// ============================================================
//  Emails the user their finished headshots (via Resend).
//  No welcome email — this IS the delivery: their permanent copy,
//  so no login/members area is needed.
//  Requires RESEND_API_KEY and a verified sender domain (EMAIL_FROM).
//  Silently no-ops if the key isn't set.
// ============================================================

export async function sendHeadshots({ to, bird, results }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  const from = process.env.EMAIL_FROM || "Headshots with a Bird <noreply@headshotswithabird.com>";

  const imgs = (results || []).filter((r) => r && r.src);
  const attachments = [];
  for (let i = 0; i < imgs.length; i++) {
    const r = imgs[i];
    let b64;
    if (r.src.startsWith("data:")) b64 = r.src.split(",")[1];
    else {
      try { b64 = Buffer.from(await (await fetch(r.src)).arrayBuffer()).toString("base64"); }
      catch { continue; }
    }
    attachments.push({ filename: `headshot-${i + 1}-${r.look || i + 1}.jpg`, content: b64 });
  }

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#0d0f14;max-width:520px">
      <h2 style="margin:0 0 8px">Your headshots are ready 🐦</h2>
      <p style="margin:0 0 12px">Attached are your 5 headshots from Headshots with a Bird. You were paired with the
        <strong>${bird?.name || "a bird"}</strong> — and yes, it's in every shot.</p>
      <p style="margin:0 0 12px;color:#6b7180">Keep this email — it's your permanent copy, so there's no account to log into.</p>
      <p style="margin:16px 0 0;color:#9aa0ad;font-size:12px">headshotswithabird.com</p>
    </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: "Your Headshots with a Bird 🐦", html, attachments }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
