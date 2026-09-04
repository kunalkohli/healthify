# Deploying to Vercel

## What Vercel actually does here

It serves static files. That's it.

This app has **no backend and no database**. Vercel hosts the compiled HTML, JS and
CSS on a CDN and never sees a byte of your health data — that lives in your phone's
IndexedDB, encrypted.

The reason to deploy at all is **HTTPS**. Four things the app needs are unavailable on
a plain `http://` origin, which is why the LAN dev server can't do them:

| Feature | Needs HTTPS |
|---|---|
| `crypto.subtle` — the whole encryption layer | yes |
| WebAuthn / Face ID unlock | yes |
| `navigator.storage.persist()` — stops iOS evicting your data | yes |
| A proper standalone home-screen install | yes |

---

## Deploy (about 3 minutes)

Do this from a **personal machine**, not a work laptop.

### 1. Clone

```bash
git clone https://github.com/kunalkohli/healthify.git
cd healthify
npm install        # or: bun install
```

### 2. Deploy

```bash
npm i -g vercel
vercel login
vercel --prod
```

Accept the defaults. `vercel.json` already sets the framework, build command,
output directory, SPA rewrites and security headers, so there is nothing to
configure in the dashboard.

You'll get a URL like `https://healthify-xxxx.vercel.app`.

**Alternative — no CLI:** go to [vercel.com/new](https://vercel.com/new), import the
`healthify` repo, click Deploy. Every push to `main` then redeploys automatically.

### 3. Set no environment variables

There are none. Your AI provider key is entered in the app on your phone and stored
in that device's IndexedDB. It is never in the repo, the build, or on Vercel.

---

## First run on your iPhone

1. Open the Vercel URL in **Safari** (not Chrome — only Safari can install to the home screen).
2. **Share → Add to Home Screen.** Do this before entering real data; installed web apps
   get durable storage, tabs don't.
3. Launch from the home-screen icon.
4. Set a passphrase. **There is no reset** — the key is derived from it and nothing is
   stored on a server. Put it in your password manager immediately.
5. Settings → **Enable Face ID unlock**.
6. Settings → **Request persistent storage**.
7. Settings → pick an AI vendor and paste a key, then **Load models & test key**.

---

## Should you password-protect the deployment?

Probably not.

Vercel's Deployment Protection on the **Hobby** plan explicitly leaves production
domains public — protecting them requires Pro, and Password Protection is Enterprise
or a $150/month Pro add-on.

It also wouldn't buy much. Anyone who opens your URL gets an **empty app**: no
accounts, no server-side data, nothing to enumerate. Your data is encrypted in your
own browser's storage. The lock that matters is the passphrase, not the URL.

---

## Known constraints

**Ollama won't work from the deployed site.** Browsers block mixed content, so an
`https://` page cannot call `http://192.168.x.x:11434`. Use Ollama with the local dev
server (`npm run dev` on `localhost`), or use a cloud vendor for the deployed app.

**Face ID is per-device.** The passkey lives in that device's secure enclave. On a new
phone you unlock with the passphrase, then re-enroll Face ID there.

**No cloud backup exists.** Export regularly: Settings → Export encrypted backup.

---

## Moving to a new phone

1. Old phone: Settings → **Export encrypted backup**, choose a passphrase for the file.
2. Send it across — AirDrop, iCloud Drive, email. The file is AES-GCM encrypted, so
   any transport is fine.
3. New phone: open the site, Add to Home Screen, then Settings → **Restore from backup**.
4. Re-enable Face ID on the new device.

---

## Updating

```bash
git pull
vercel --prod
```

Or just push to `main` if you imported via the dashboard.

Your data is untouched by deploys — it lives in the browser, not the bundle.

---

## Local development

```bash
npm run dev      # http://localhost:5173, also served on your LAN
bun test         # risk-engine tests, including ASCVD reference cases (needs bun)
npm run build    # production build into dist/
```

On `http://` (LAN address) the app detects the missing secure context and offers an
explicitly-labelled unencrypted mode so you can still work on the UI. `localhost` is
treated as secure by browsers, so encryption and Face ID both work there.
