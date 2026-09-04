import type { Profile } from "../schema/index.ts";
import { ASCVD_MODEL, ascvd } from "./ascvd.ts";
import { FINDRISC_MODEL, findrisc } from "./findrisc.ts";
import { FRS_SIMPLE_MODEL, frsSimple } from "./frsSimple.ts";
import { allMetrics, type Metric } from "./metrics.ts";
import { familyFlags, type Flag } from "./hereditary.ts";
import { assessBmi } from "./anthropometry.ts";
import type { MissingInput, RiskModel, RiskOutcome } from "./types.ts";

export * from "./types.ts";
export { assessBmi, bmiThresholds, waistThreshold, waistIsElevated } from "./anthropometry.ts";
export { familyFlags } from "./hereditary.ts";
export type { Flag } from "./hereditary.ts";
export { riskEnhancers } from "./ascvd.ts";
export { allMetrics } from "./metrics.ts";
export type { Metric } from "./metrics.ts";

export type ComputedRisk = { model: RiskModel; outcome: RiskOutcome };

export const MODELS: { model: RiskModel; fn: (p: Profile) => RiskOutcome }[] = [
  { model: FINDRISC_MODEL, fn: findrisc },
  // Lab-free CVD first: it usually produces a number when ASCVD cannot.
  { model: FRS_SIMPLE_MODEL, fn: frsSimple },
  { model: ASCVD_MODEL, fn: ascvd },
];

export function computeAll(p: Profile): ComputedRisk[] {
  return MODELS.map(({ model, fn }) => ({ model, outcome: fn(p) }));
}

export function computeOne(p: Profile, id: string): ComputedRisk | null {
  const m = MODELS.find((x) => x.model.id === id);
  return m ? { model: m.model, outcome: m.fn(p) } : null;
}

/**
 * Aggregate every missing input across all models into one deduplicated list.
 * This drives the single most immediately useful screen in the app: a concrete
 * list of tests to ask a doctor for.
 */
export function missingInputs(p: Profile): MissingInput[] {
  const seen = new Set<string>();
  const out: MissingInput[] = [];
  for (const { outcome } of computeAll(p)) {
    if (outcome.status !== "partial") continue;
    for (const m of outcome.missing) {
      const key = m.analyte ?? m.label;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
    }
  }
  return out;
}

export type RiskSnapshot = {
  computedAt: string;
  risks: ComputedRisk[];
  flags: Flag[];
  bmi: ReturnType<typeof assessBmi>;
  metrics: Metric[];
  missing: MissingInput[];
};

export function snapshot(p: Profile): RiskSnapshot {
  return {
    computedAt: new Date().toISOString(),
    risks: computeAll(p),
    flags: familyFlags(p),
    bmi: assessBmi(p),
    metrics: allMetrics(p),
    missing: missingInputs(p),
  };
}
