## What changed

<!-- One or two lines. -->

## If this touches `src/core/risk/`

Changes to the calculators need more than "it looks right":

- [ ] Cited a published source for any coefficient, threshold or rule
- [ ] Added or updated a test against a worked example from that source
- [ ] Checked the engine still *refuses* correctly (out of range, missing
      inputs, already diagnosed) rather than producing a number

Coefficients recalled from memory are the highest-risk change in this repo —
one was already caught during development where `23.98` should have been
`23.9388`, which would have shifted every cardiovascular result.

## Checks

- [ ] `bun test` passes
- [ ] `bunx tsc --noEmit` clean
- [ ] No secrets, API keys or personal health data in the diff
