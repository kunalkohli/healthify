# Setup guide

How to run your own copy of Healthify. Budget about 15 minutes, most of it waiting.

You do **not** need to be a developer. There's a one-click path.

---

## What you're actually setting up

Healthify has no server. It's a website made of static files, and everything it knows
about you lives inside your own phone's storage, encrypted.

So "deploying" means putting the app's files on a free host so your phone can load them.
The host never receives your health data — it only hands over the same HTML and
JavaScript to your browser each time.

The one thing hosting buys you is **HTTPS**, and it's not optional. Browsers refuse to
expose four things over plain `http://`:

| Feature | Why it needs HTTPS |
|---|---|
| Encryption (`crypto.subtle`) | Browsers hide the crypto API on insecure origins |
| Face ID unlock (WebAuthn) | Same |
| Durable storage | Otherwise the OS may evict your data |
| Proper home-screen install | Standalone apps need a secure origin |

---

## Step 1 — Get an AI key

The risk calculators work with no key at all. The **chat coach** needs one. Pick a
vendor; you can change it later in the app and it remembers each vendor's key
separately.

### Google Gemini — free, recommended to start

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Sign in with a Google account
3. **Create API key**, copy it

Genuinely free tier. No credit card. Rate limited, but generously for one person.

### Anthropic (Claude) — best answers, about $5

Claude gives noticeably better medical reasoning. It needs prepaid credit and is
**separate from a claude.ai Pro subscription** — Pro does not include API access.

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Billing → add $5 of credit. **Leave auto-reload off** — then it can never charge you
   more than the $5, which is a harder cap than any spending limit
3. API keys → Create key, copy it

$5 goes a long way here. The app caches its context and defaults to brief replies, which
together work out to roughly 600+ exchanges.

### Ollama — free and completely private

Runs a model on your own computer, so nothing leaves your home network.

Two real catches: your computer must be awake and on the same Wi-Fi, and **it won't work
from the deployed HTTPS site** — browsers block secure pages from calling insecure local
addresses. Use it with the local dev server instead (see Development below).

---

## Step 2 — Deploy

### The easy way

Click the button in the [README](./README.md#run-your-own). It asks you to sign in to
GitHub and Vercel, copies the repo to your account, and deploys it.

Accept every default. There are **no environment variables to set** — your API key gets
entered on your phone later, not here.

You'll end up with a URL like `https://healthify-abc123.vercel.app`.

### The terminal way

```bash
git clone https://github.com/kunalkohli/healthify.git
cd healthify
npm install
npx vercel --prod
```

Sign in when prompted and accept the defaults. `vercel.json` already configures the
build, routing, and security headers.

### Other hosts

Any static host works — Netlify, Cloudflare Pages, GitHub Pages. Build with
`npm run build` and serve the `dist/` folder. Two requirements: HTTPS, and a rewrite
sending all paths to `index.html` (it's a single-page app).

---

## Step 3 — Install it on your phone

### iPhone

1. Open your URL in **Safari**. It has to be Safari — Chrome on iOS can't install to the
   home screen.
2. Share button → **Add to Home Screen** → Add.
3. Launch it from the new icon, not the Safari tab.

Do this **before** entering real data. Installed web apps get durable storage; ordinary
tabs can be cleared by iOS when space runs low.

### Android

Open in Chrome → menu → **Install app** / **Add to Home screen**.

---

## Step 4 — First run

**1. Set a passphrase.**

This encrypts everything on the device.

> **There is no reset.** The key is derived from your passphrase and nothing exists on
> any server. Forget it and the data is gone — the only option is erasing and starting
> over.

Let your password manager generate and save it. Tap **Show** and check it before
continuing. An autocapitalised first letter is the most common way people lock
themselves out.

**2. Settings → Enable Face ID.** Now you rarely type the passphrase. It's tied to this
specific device.

**3. Settings → Request persistent storage.** Tells the OS not to evict your data.

**4. Settings → pick a vendor, paste your key, then Load models & test key.** This
fetches the model list from your account, so you can only pick an ID that really exists.
It doubles as a check that your key works.

---

## Step 5 — Fill in your profile

Six short steps. Some fields matter more than they look:

**Ethnicity** isn't demographics — it changes the arithmetic. South and East Asian
ancestry lowers the overweight BMI threshold from 25 to 23 and the waist cut-off too,
and South Asian ancestry is a formal cardiovascular risk enhancer. Getting this wrong
understates your risk.

**Waist** feeds three separate calculations and predicts cardiometabolic risk better
than BMI. Measure at the navel, relaxed, after breathing out.

**Blood pressure** is the single highest-value number you can get without a doctor. A
$40 home cuff turns "not enough data" into a real 10-year cardiovascular estimate.

**Family history: ages at diagnosis matter more than the diagnoses.** A parent
diagnosed at 45 means something very different from one diagnosed at 80 — it's what
separates an inherited pattern from an ordinary one. Estimate if you have to.

---

## Backups and moving to a new phone

There is no cloud copy. If you lose the phone and have no export, the data is gone.

**To back up:** Settings → **Export encrypted backup**. Choose a passphrase for the
file. It's AES-encrypted, so emailing it to yourself or dropping it in iCloud is fine.

**To move to a new phone:**

1. Old phone: export as above
2. Send the file across — AirDrop, iCloud Drive, email
3. New phone: open your URL, Add to Home Screen, then Settings → **Restore from backup**
4. Re-enable Face ID there — passkeys live in each device's secure enclave and can't
   transfer

---

## Troubleshooting

**"Set a passphrase" on first load.** Expected. That's the vault being created.

**Passphrase won't work.** Tap **Show** and check capitalisation and trailing spaces.
If it's genuinely lost: **Forgotten your passphrase?** on the lock screen erases
everything and starts over. There's no recovery — that's the tradeoff for nobody else
holding your key.

**Microphone button does nothing.** iOS doesn't give home-screen apps in-app dictation.
Tap the message box and use the microphone on the keyboard instead — it works the same.
Opening the site in a Safari tab enables the in-app button.

**"Model doesn't exist."** Settings → **Load models & test key**, then pick from the
list. Model names change over time.

**Ollama can't connect from the deployed site.** Expected — browsers block HTTPS pages
from calling `http://` addresses. Ollama only works with the local dev server.

**A risk shows "N/A" or "Need data".** Working as designed. Rather than invent a number,
it tells you which input is missing or why the model doesn't apply to you. ASCVD is only
validated for ages 40–79 and needs a lipid panel; the Framingham model covers 30–74
with no bloodwork, but still needs a blood pressure reading.

**Data disappeared.** Storage was evicted. Add to Home Screen, request persistent
storage, and keep exports.

---

## What leaves your device

Only your chat messages, and only to the AI vendor you chose.

Your **risk scores are computed locally** in JavaScript and never sent anywhere. The
host serving the app sees nothing but ordinary requests for static files.

If you want nothing at all to leave, use Ollama with the local dev server. You lose
answer quality and convenience; you gain complete isolation.

---

## Updating

If you deployed with the button, Vercel redeploys automatically when you sync your fork.
Otherwise:

```bash
git pull
npx vercel --prod
```

Your data is untouched by deploys — it lives in the browser, not the bundle.

---

## Development

```bash
npm run dev      # localhost:5173, also served on your LAN
bun test         # risk engine tests (uses bun:test, so needs bun)
npm run build
```

`localhost` counts as a secure context, so encryption and Face ID work in development.
On a LAN IP over plain HTTP they don't — the app detects this and offers an explicitly
labelled unencrypted mode so you can work on the UI. Don't put real data in that mode.
