# Healthify

A personal, local-first health coach you run yourself. Installs to your phone's home
screen as a web app.

Ask it things like *"high blood pressure runs in my family — what should I actually
change first?"* and get an answer grounded in your own family history and validated
risk calculators, not a language model's recollection of them.

**Single user, self-hosted. No accounts, no backend, no database, no telemetry.**
Everything lives encrypted in your own device's storage.

---

> ### This is not a medical device
>
> Healthify is an educational tool. It does not diagnose, treat, or prescribe.
>
> Risk calculators describe **populations, not individuals** — a low number is not a
> guarantee and a high one is not a verdict. The scores here are re-implementations of
> published instruments and may contain errors.
>
> Nothing here replaces a clinician. If something is worrying you, see a doctor. If you
> have chest pain, one-sided weakness, difficulty speaking, difficulty breathing, or
> thoughts of self-harm, seek urgent care now.
>
> Provided as-is with no warranty. You are responsible for what you do with it.

---

## The idea

> Deterministic maths produces every number. The model only explains it.

Ask a chatbot for your 10-year cardiovascular risk and it will give you a confident,
plausible, wrong number. So here it isn't allowed to.

Every quantitative claim comes from a calculator implemented in `src/core/risk/`. The
model reaches them through tool calls, and the system prompt forbids stating a figure
that didn't come from one.

Just as importantly, **the engine refuses when it can't be certain**:

- ASCVD outside its validated 40–79 range returns `not_applicable` with an explanation,
  never an extrapolation
- No lipid panel? It returns `partial` plus the exact tests to ask your doctor for,
  rather than estimating
- Already diagnosed? A risk-of-onset score is meaningless, so it says so

That "here's what I can't tell you and why" output is usually more useful than a
fabricated number.

## What it does

**Risk engine** — pure TypeScript, no platform dependencies, unit tested against
published worked examples.

| Model | Notes |
|---|---|
| FINDRISC | 10-year type 2 diabetes. No bloodwork, so it works on day one. |
| Framingham (office-based) | 10-year cardiovascular using BMI instead of a lipid panel. Ages 30–74. |
| ASCVD | 2013 ACC/AHA Pooled Cohort Equations plus the 2018 risk enhancers. Ages 40–79. |
| Blood pressure | ACC/AHA 2017 staging. |
| Waist-to-height | NICE recommends it alongside BMI; the 0.5 boundary holds across populations. |
| Metabolic syndrome | Harmonized 3-of-5 criteria, reporting unknowns as unknown. |

**Ethnicity is handled properly, because it changes the maths.** WHO/NICE/ADA lower the
overweight threshold to BMI 23 for South and East Asian ancestry, IDF lowers the waist
cut-off, and South Asian ancestry is a formal ACC/AHA cardiovascular risk enhancer.
Using the generic figures materially understates risk for a large part of the world.

**Family-history rules** — Amsterdam-II (Lynch syndrome), NCCN/USPSTF BRCA referral
criteria, premature-CVD enhancers, diabetes clustering. Rule-based deliberately:
referral criteria are discrete and consequential, and a model paraphrasing them drifts.

**Coach** — tool-calling chat over Anthropic, Google Gemini, Ollama, or any
OpenAI-compatible endpoint. Bring your own key; each vendor keeps its own. Model lists
are fetched from your account rather than hardcoded. Voice dictation for input.

**Memory** — durable facts are proposed after a conversation and **you approve each
one**. Silent auto-write is how a memory store quietly fills with confident wrong
inferences about you.

**Encryption** — AES-GCM with a random data key, itself wrapped separately by a
PBKDF2-derived passphrase key (600k iterations) and optionally a Face ID key via the
WebAuthn PRF extension. Auto-locks after three minutes in the background. Encrypted
export/import for moving between devices.

## Run your own

You need a free [Vercel](https://vercel.com) account and an API key from one AI vendor.
Gemini has a genuinely free tier and needs no credit card.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fkunalkohli%2Fhealthify)

Or from a terminal:

```bash
git clone https://github.com/kunalkohli/healthify.git
cd healthify && npm install
npx vercel --prod
```

There are **no environment variables**. Your API key is entered in the app on your phone
and stored in that device's encrypted storage — never in the repo, the build, or on
Vercel.

Then open your deployment in Safari on iPhone, **Add to Home Screen**, set a passphrase,
and enable Face ID. Full walkthrough in [DEPLOY.md](./DEPLOY.md).

Any static host works — Netlify, Cloudflare Pages, GitHub Pages. It just needs HTTPS,
because `crypto.subtle` and WebAuthn are unavailable on plain HTTP.

## Why self-host rather than use a hosted version

There isn't a hosted version, on purpose.

Storing other people's family medical history means special-category data under GDPR,
likely HIPAA exposure, and a breach surface worth attacking. A single-user app with no
server has none of that. The best way to keep your data safe is for it never to leave
your device.

## Development

```bash
npm run dev      # localhost:5173, also served on your LAN
bun test         # risk engine tests (uses bun:test)
npm run build
```

`localhost` counts as a secure context, so encryption and Face ID work in development.
On a LAN IP over plain HTTP they don't, and the app says so and offers an explicitly
labelled unencrypted mode for UI work.

### Tests

The ASCVD suite checks the published ACC/AHA worked examples — 5.3% / 2.1% / 6.1% / 3.0%
for a 55-year-old with total cholesterol 213, HDL 50, untreated SBP 120. Framingham
checks its reference case of 16.7%. If those drift, a coefficient table is wrong and
every number in the app is wrong.

There are also tests asserting the engine **refuses** correctly: out of age range,
missing inputs, already diagnosed.

### Layout

```
src/
  core/            pure TypeScript, zero platform imports
    schema/        zod models
    risk/          the calculators
    context/       structured data -> markdown docs for the prompt
    agent/         prompts, tools, provider adapters
    units.ts       metric/imperial, mg-dL/mmol-L
  storage/         IndexedDB + crypto (browser-specific)
  ui/              React components
```

`src/core/` avoids DOM and React so a native port is a UI rewrite against an unchanged
engine.

## Contributing

Corrections to the risk engine are especially welcome — particularly if you can point at
a published source. If you find a coefficient that disagrees with the literature, please
open an issue with the citation; that is the highest-value bug class in this project.

## License

MIT — see [LICENSE](./LICENSE).
