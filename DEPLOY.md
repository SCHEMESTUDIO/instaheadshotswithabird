# Deploy guide — Render (Path B), Stripe test mode (detailed)

Follow top to bottom. Labels in the Render/Stripe/GitHub UIs may differ slightly over time,
but the actions are the same.

---

## Step 0 — Clear the git lock files (one-time, ~30 sec)

The repo was created for you but left 3 stale lock files. In your Mac **Terminal**:

```bash
cd "/Users/jameshd/Documents/Claude/Projects/Scheme Studio/instaheadshotswithabird"
rm -f .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock
git status
```

`git status` should print "nothing to commit, working tree clean" and mention 1 commit. Good.

---

## Step 1 — Push the code to GitHub

You need a GitHub account (github.com). Two ways — pick ONE.

### Option A — GitHub Desktop (easiest, no tokens)
1. Install GitHub Desktop (desktop.github.com) and sign in with your GitHub account.
2. **File → Add Local Repository** → choose the folder
   `…/Scheme Studio/instaheadshotswithabird` → Add.
3. Top bar will say "Publish repository." Click it.
4. Set the name `instaheadshotswithabird`, choose **Private** (recommended for now),
   leave "Keep this code private" checked, click **Publish repository.**
5. Done — your code is on GitHub.

### Option B — Terminal
1. On github.com, click **+** (top right) → **New repository.**
2. Name it `instaheadshotswithabird`. Choose Private. **Do NOT** check "Add a README,"
   ".gitignore," or "license" (the repo must be empty). Click **Create repository.**
3. GitHub shows a URL like `https://github.com/<you>/instaheadshotswithabird.git`. Copy it.
4. Back in Terminal (still in the project folder):
   ```bash
   git remote add origin https://github.com/<you>/instaheadshotswithabird.git
   git branch -M main
   git push -u origin main
   ```
5. **Auth prompt:** GitHub no longer accepts your password here. When asked, either:
   - let it open a browser to authorize, OR
   - use a **Personal Access Token** as the password: github.com → Settings → Developer
     settings → Personal access tokens → Tokens (classic) → Generate new token → tick `repo`
     → copy it → paste as the password.
   (GitHub Desktop, Option A, avoids all of this.)

---

## Step 2 — Deploy on Render

### 2a. Get your three secret values first (so they're ready to paste)
- **REPLICATE_API_TOKEN:** replicate.com → sign in → click your avatar → **API tokens** →
  Create token → copy the `r8_...` string.
- **STRIPE_SECRET_KEY (test):** dashboard.stripe.com → make sure the **Test mode** toggle
  (top-right) is ON → **Developers → API keys** → under "Secret key" click **Reveal** →
  copy the `sk_test_...` string.
- **ADMIN_KEY:** just invent a random string. Generate one in Terminal if you like:
  ```bash
  openssl rand -hex 16
  ```
  Copy the output. (This is what lets you approve reviews later.)

### 2b. Create the Render service
1. Go to dashboard.render.com → **Sign up** / log in. Easiest: **Sign in with GitHub**
   (this pre-connects your repos).
2. Click **New +** (top right) → **Blueprint.**
3. Find and select your `instaheadshotswithabird` repo. If you don't see it, click
   **Configure account / Connect GitHub** and grant Render access to the repo, then retry.
4. Render reads `render.yaml` and shows a service named `instaheadshotswithabird`. Give the
   blueprint group any name. Click **Apply** / **Create.**
5. Render will ask for the env vars marked as secrets. Paste:
   - `REPLICATE_API_TOKEN` → your `r8_...`
   - `STRIPE_SECRET_KEY` → your `sk_test_...`
   - `ADMIN_KEY` → your random string
   (Leave `PUBLIC_URL` blank for now — you'll set it in Step 3. `PROVIDER` is already `replicate`.)
6. Click to start the deploy. Watch the **Logs** tab. When it finishes it shows
   "Live" and a URL like `https://instaheadshotswithabird.onrender.com`.

> If you used **New + → Web Service** instead of Blueprint: set Build Command `npm install`,
> Start Command `npm start`, then add the same env vars under the **Environment** tab.

---

## Step 3 — Set PUBLIC_URL (this is what makes payment work)

1. Copy your live URL (e.g. `https://instaheadshotswithabird.onrender.com`).
2. In Render: open the service → **Environment** (left sidebar) → **Add Environment Variable.**
3. Key: `PUBLIC_URL`  ·  Value: your exact URL, starting with `https://`, **no trailing slash.**
4. **Save changes** — Render redeploys automatically (~1–2 min).
5. Verify: open `https://<your-url>/healthz` in a browser. You should see
   `"paymentsEnabled": true`. If it says `false`, your `STRIPE_SECRET_KEY` isn't set.

---

## Step 4 — Test the $1 flow (test mode, no real money)

1. Open your live URL. (First load after idle can take ~30–60s on the free plan — normal.)
2. **Upload a selfie** → **Continue to payment · $1.**
3. You land on Stripe Checkout. Enter the **test card**:
   - Card number: **4242 4242 4242 4242**
   - Expiry: any future date (e.g. 12/34)
   - CVC: any 3 digits (e.g. 123)
   - Name/ZIP: anything
   Click **Pay.**
4. You're redirected back. Your **Bird ID** appears and the **3 headshots** generate
   (a few seconds each). If they error, check `REPLICATE_API_TOKEN` in Render → Logs.
5. Hover any headshot → click **⬇ download** or **↗ share**. A **review** prompt appears.
   Give it stars + a ≤30-word note + submit.
6. **Approve that review** so it shows in the homepage carousel. In Terminal:
   ```bash
   # list reviews to find the id
   curl "https://<your-url>/api/admin/reviews?key=YOUR_ADMIN_KEY"
   # approve it
   curl -X POST https://<your-url>/api/admin/approve \
     -H "Content-Type: application/json" \
     -d '{"key":"YOUR_ADMIN_KEY","id":"THE_ID","approved":true}'
   ```
   Reload the homepage — the review now appears in the carousel.
7. Confirm in Stripe: dashboard.stripe.com (Test mode) → **Payments** → you'll see the $1 test payment.

---

## Common snags
- **Redirected to an http:// page or Stripe error** → `PUBLIC_URL` is missing or wrong (Step 3).
- **Logs say "payments: DEV BYPASS"** → `STRIPE_SECRET_KEY` isn't set on Render.
- **Headshots fail** → bad/missing `REPLICATE_API_TOKEN`, or you're out of Replicate credit.
- **Reviews disappear after a redeploy** → expected on the free plan (ephemeral disk). For
  persistence: Render → upgrade to **Starter**, add a **Disk** (mount `/var/data`, 1GB), and add
  env var `DATA_DIR=/var/data`. (See the commented block in `render.yaml`.)
- **Site slow on first hit** → free-plan cold start; upgrade to a paid instance to keep it warm.

---

## When you're ready for real money
Swap `STRIPE_SECRET_KEY` to your live `sk_live_...` key, add your domain (Render → Settings →
Custom Domains → add `instaheadshotswithabird.com` + the DNS records it shows), and update
`PUBLIC_URL` to `https://instaheadshotswithabird.com`.
