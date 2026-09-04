# Healthify

A personal, local-first health coach. Runs as an installable web app on your phone.

Answers questions like *"what should I eat to lower my diabetes risk, given my dad was
diagnosed at 52?"* — grounded in your actual family history and validated risk
calculators rather than a model's recollection.

**Single user. No accounts, no backend, no database.** Everything lives encrypted in
your device's IndexedDB.

See [DEPLOY.md](./DEPLOY.md) to put it on your phone.

---

## The core idea

> Deterministic maths produces the numbers. The model only explains them.

Ask a chatbot for your 10-year cardiovascular risk and it will give you a confident,
plausible, wrong number. So it isn't allowed to.

Every quantitative claim comes from a published calculator implemented in
`src/core/risk/`. The model reaches them through tool calls, and the system prompt
forbids stating a figure that didn't come from one.

Just as important: **the engine refuses when it can't be certain.**

- ASCVD outside its validated 40–79 range returns `not_applicable` with an explanation,
  not an extrapolation
- Missing a lipid panel returns `partial` plus the exact list of tests to ask for,
  not an estimate
- Already diagnosed? A risk-of-onset score is meaningless, so it says so

That "here's what I can't tell you and why" output is usually more useful than a
fabricated number.

## What's implemented

**Risk engine** (`src/core/risk/`)
- **FINDRISC** — 10-year type 2 diabetes. Needs no bloodwork, so it works on day one.
- **ASCVD** — 2013 ACC/AHA Pooled Cohort Equations, with the 2018 risk enhancers.
- **Ethnicity-adjusted anthropometry** — WHO/NICE/ADA lowered BMI and IDF waist
  thresholds. South Asian ancestry moves the diabetes-screening BMI cut-off from 25
  to 23; using the generic figure materially understates risk.
- **Family-history rules** — Amsterdam-II (Lynch), NCCN/USPSTF BRCA referral criteria,
  premature-CVD enhancers, diabetes clustering. Rule-based on purpose: referral
  criteria are discrete and consequential, and a model paraphrasing them drifts.

**Coach** — tool-calling chat over Anthropic, Gemini, Ollama, or any OpenAI-compatible
endpoint. Each vendor keeps its own key. Model lists are fetched live rather than
hardcoded. Voice dictation for input.

**Memory** — durable facts are proposed after a conversation and **you approve each
one**. Silent auto-write is how a memory store fills with confident wrong inferences.

**Encryption** — AES-GCM with a random data key, itself wrapped separately by a
PBKDF2-derived passphrase key (600k iterations) and optionally by a Face ID key via
the WebAuthn PRF extension. Auto-locks after 3 minutes in the background.

## Tests

```bash
bun test     # the test runner is bun:test, so this needs bun installed
```

The ASCVD suite checks against the published ACC/AHA worked examples — 5.3% / 2.1% /
6.1% / 3.0% for a 55-year-old with TC 213, HDL 50, untreated SBP 120. If those drift,
the coefficient table is wrong and every number in the app is wrong.

There are also tests asserting the engine **refuses** correctly: out of age range,
missing labs, already diagnosed.

## Layout

```
src/
  core/            pure TypeScript, zero platform imports
    schema/        zod models
    risk/          the calculators
    context/       structured data -> markdown docs for the prompt
    agent/         prompts, tools, provider adapters
    units.ts       metric/imperial, mg-dL/mmol-L
  storage/         IndexedDB + crypto  (browser-specific)
  ui/              React components
```

`src/core/` stays free of DOM and React so a native port is a UI rewrite against an
unchanged engine.

## Not a medical device

Educational tool. Not a diagnosis. Risk calculators describe populations, not
individuals — a low number isn't a guarantee and a high one isn't a verdict. Talk to
an actual doctor.
