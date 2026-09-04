import { DIABETES, type Analyte, type Profile } from "../schema/index.ts";
import type { RiskBand } from "./types.ts";
import { waistThreshold } from "./anthropometry.ts";

/**
 * Single-number assessments that don't warrant a full risk model but are
 * immediately actionable. All are exact published thresholds — no regression
 * coefficients, so nothing here can drift.
 */
export type Metric = {
  id: string;
  label: string;
  value: string;
  band: RiskBand;
  detail: string;
  citation?: string;
};

function latest(p: Profile, a: Analyte): number | null {
  const rows = p.labs.filter((l) => l.analyte === a).sort((x, y) => y.takenAt.localeCompare(x.takenAt));
  return rows.length ? rows[0].value : null;
}

/** ACC/AHA 2017 hypertension staging. */
export function bloodPressureMetric(p: Profile): Metric | null {
  const s = p.vitals.systolic;
  const d = p.vitals.diastolic;
  if (s == null || d == null) return null;

  let band: RiskBand;
  let stage: string;
  let detail: string;

  if (s > 180 || d > 120) {
    band = "very_high";
    stage = "Hypertensive crisis";
    detail =
      "This range warrants urgent medical attention, not a coaching plan. If this is a repeated reading rather than a one-off, seek care now.";
  } else if (s >= 140 || d >= 90) {
    band = "high";
    stage = "Stage 2 hypertension";
    detail =
      "Guidelines recommend medication alongside lifestyle change at this level. Worth a doctor's appointment.";
  } else if (s >= 130 || d >= 80) {
    band = "moderate";
    stage = "Stage 1 hypertension";
    detail =
      "Lifestyle change first for most people; medication depends on your overall cardiovascular risk. Salt reduction and aerobic exercise are the highest-yield levers.";
  } else if (s >= 120) {
    band = "slightly_elevated";
    stage = "Elevated";
    detail =
      "Not hypertension, but it tends to progress. This is the cheapest point at which to intervene.";
  } else {
    band = "low";
    stage = "Normal";
    detail = "Keep it here — blood pressure is one of the strongest modifiable inputs to every cardiovascular model.";
  }

  return {
    id: "bp",
    label: "Blood pressure",
    value: `${s}/${d}`,
    band,
    detail: `${stage}. ${detail}`,
    citation: "2017 ACC/AHA High Blood Pressure Guideline",
  };
}

/**
 * Waist-to-height ratio. NICE recommends it alongside BMI because it captures
 * central adiposity, which is what actually drives cardiometabolic risk, and it
 * needs no ethnicity adjustment — the 0.5 boundary holds across populations.
 */
export function waistToHeightMetric(p: Profile): Metric | null {
  const w = p.anthropometrics.waistCm;
  if (w == null) return null;
  const r = w / p.anthropometrics.heightCm;

  let band: RiskBand;
  let detail: string;
  if (r >= 0.6) {
    band = "high";
    detail = "Well above the 0.5 boundary. Central fat is the most metabolically active kind, and this is the number to move.";
  } else if (r >= 0.5) {
    band = "moderate";
    detail = "Above the 0.5 boundary — increased central adiposity. The rule of thumb is to keep your waist under half your height.";
  } else if (r >= 0.4) {
    band = "low";
    detail = "In the healthy range. Worth re-measuring every few months, since this moves before weight does.";
  } else {
    band = "slightly_elevated";
    detail = "Below the usual healthy range. Worth mentioning to a doctor if unintentional.";
  }

  return {
    id: "whtr",
    label: "Waist-to-height",
    value: r.toFixed(2),
    band,
    detail,
    citation: "NICE NG246 — waist-to-height ratio as an adjunct to BMI",
  };
}

/**
 * Harmonized metabolic syndrome criteria: any 3 of 5.
 * Reports how many are met AND how many can't yet be judged, rather than
 * quietly treating unknown as negative.
 */
export function metabolicSyndromeMetric(p: Profile): Metric | null {
  type Crit = { name: string; met: boolean | null };

  const onBp = p.vitals.onBloodPressureMeds;
  const diabetic = p.ownConditions.some((c) => DIABETES.includes(c.condition));

  const waist = p.anthropometrics.waistCm;
  const waistCut = waistThreshold(p.sexAtBirth, p.ethnicity);

  const tg = latest(p, "triglycerides_mgdl");
  const hdl = latest(p, "hdl_mgdl");
  const glu = latest(p, "fasting_glucose_mgdl");
  const hba1c = latest(p, "hba1c_pct");

  const crits: Crit[] = [
    {
      name: `Waist ≥ ${waistCut ?? "—"} cm`,
      met: waist == null || waistCut == null ? null : waist >= waistCut,
    },
    { name: "Triglycerides ≥ 150 mg/dL", met: tg == null ? null : tg >= 150 },
    {
      name: `HDL < ${p.sexAtBirth === "female" ? 50 : 40} mg/dL`,
      met: hdl == null ? null : hdl < (p.sexAtBirth === "female" ? 50 : 40),
    },
    {
      name: "BP ≥ 130/85 or treated",
      met:
        onBp
          ? true
          : p.vitals.systolic == null || p.vitals.diastolic == null
            ? null
            : p.vitals.systolic >= 130 || p.vitals.diastolic >= 85,
    },
    {
      name: "Fasting glucose ≥ 100 mg/dL or diabetes",
      met: diabetic ? true : glu != null ? glu >= 100 : hba1c != null ? hba1c >= 5.7 : null,
    },
  ];

  const met = crits.filter((c) => c.met === true);
  const unknown = crits.filter((c) => c.met === null);

  // Nothing measurable yet — don't show an empty card.
  if (met.length === 0 && unknown.length >= 4) return null;

  const definite = met.length >= 3;
  const possible = met.length + unknown.length >= 3 && !definite;

  let band: RiskBand = "low";
  if (definite) band = "high";
  else if (met.length === 2) band = "moderate";
  else if (met.length === 1) band = "slightly_elevated";

  const detailParts: string[] = [];
  detailParts.push(`Met: ${met.length ? met.map((c) => c.name).join(", ") : "none"}.`);
  if (unknown.length)
    detailParts.push(`Not yet measurable: ${unknown.map((c) => c.name).join(", ")}.`);
  if (definite)
    detailParts.push(
      "Three or more criteria means metabolic syndrome, which roughly doubles cardiovascular risk and multiplies diabetes risk several-fold. It is also highly reversible.",
    );
  else if (possible)
    detailParts.push("Filling the gaps would settle whether you meet the definition.");

  return {
    id: "metsyn",
    label: "Metabolic syndrome",
    value: `${met.length}/5`,
    band,
    detail: detailParts.join(" "),
    citation: "Alberti KGMM et al. Harmonizing the Metabolic Syndrome. Circulation 2009;120:1640-1645.",
  };
}

export function allMetrics(p: Profile): Metric[] {
  return [
    bloodPressureMetric(p),
    waistToHeightMetric(p),
    metabolicSyndromeMetric(p),
  ].filter((m): m is Metric => m !== null);
}
