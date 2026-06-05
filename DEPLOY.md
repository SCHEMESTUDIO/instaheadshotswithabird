# Deploy guide — Render (Path B), Stripe test mode

Goal: a live public URL running the current code, with Stripe in **test mode**.
Render is used below; Railway is nearly identical (it auto-detects `npm start` via the Procfile).

---

## 0. One-time: get your keys ready

- **Replicate token** — https://replicate.com/account/api-tokens (you have this).
- **Stripe TEST secret key** — https://dashboard.stripe.com/test/apikeys → "Secret key" starting `sk_test_...`.
  (Make sure the dashboard toggle says **Test mode**.)
- **Admin key** — invent any random string (used to approve reviews).

---

## 1. Push to GitHub

I've already run `git init` and made the first commit locally. Now create an empty repo and push:

```bash
cd "instaheadshotswithabird"
# create a new EMPTY repo on github.com first (no README), then:
git remote add origin https://github.com/<you>/instaheadshotswithabird.git
git branch -M main
git push -u origin main
```

(Or use GitHub Desktop: Add Local Repository → this folder → Publish.)

---

## 2. Deploy on Render

1. https://dashboard.render.com → **New → Blueprint** → connect the repo. It reads `render.yaml`.
   (Or **New → Web Service**, build `npm install`, start `npm start`.)
2. When prompted, set the secret env vars:
   - `REPLICATE_API_TOKEN` = your token
   - `STRIPE_SECRET_KEY` = your `sk_test_...`
   - `ADMIN_KEY` = your random string
   - `PROVIDER` = `replicate` (already in the blueprint)
3. Deploy. You'll get a URL like `https://instaheadshotswithabird.onrender.com`.
4. Add **`PUBLIC_URL`** = that exact URL, then redeploy (so Stripe redirects are correct).
5. Open the URL. Health check: `…/healthz` should return `paymentsEnabled: true`.

> Free plan note: the disk is **ephemeral** — reviews and the no-repeat bird counter reset on
> restart/redeploy. Fine for testing. For real beta persistence, see the bottom of `render.yaml`
> (switch to `starter` + add a disk + `DATA_DIR=/var/data`).

---

## 3. Test the $1 flow (test mode)

1. On the live site: upload a selfie → **Continue to payment**.
2. On Stripe Checkout use the test card: **4242 4242 4242 4242**, any future expiry, any CVC, any ZIP.
3. You'll be redirected back; your bird is revealed and 5 headshots generate.
4. Click download/share → leave a review.
5. Approve it so it appears in the homepage carousel:
   ```bash
   curl "https://<your-url>/api/admin/reviews?key=YOUR_ADMIN_KEY"          # find the id
   curl -X POST https://<your-url>/api/admin/approve \
     -H "Content-Type: application/json" \
     -d '{"key":"YOUR_ADMIN_KEY","id":"REVIEW_ID","approved":true}'
   ```

No real money moves in test mode. Test payments show under **Test mode** in your Stripe dashboard.

---

## 4. Your domain (optional, when ready)

Render → service → **Settings → Custom Domains** → add `instaheadshotswithabird.com`, then add the
CNAME/A records it shows at your registrar. Update `PUBLIC_URL` to `https://instaheadshotswithabird.com`.

---

## 5. Going live for real (later)

- Flip Stripe to **live** keys (`sk_live_...`) and update `STRIPE_SECRET_KEY`.
- Move to a paid plan + disk (or external store) so reviews/bird-count persist.
- Consider the webhook (`/api/stripe/webhook` + `STRIPE_WEBHOOK_SECRET`) as a payment backstop.

---

### Quick troubleshooting
- **Stripe redirect goes to http / fails** → set `PUBLIC_URL` to your https URL and redeploy.
- **"payments: DEV BYPASS" in logs** → `STRIPE_SECRET_KEY` isn't set on the host.
- **Generations fail** → check `REPLICATE_API_TOKEN`; watch the Render logs.
- **Cold start delay (~30–60s)** on free plan after inactivity is normal.
