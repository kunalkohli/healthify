import {
  DIABETES,
  ageFrom,
  bmiOf,
  degreeOf,
  type Profile,
} from "../schema/index.ts";
import type { Modifier, RiskBand, RiskModel, RiskOutcome } from "./types.ts";
import { assessBmi, waistThreshold } from "./anthropometry.ts";

export const FINDRISC_MODEL: RiskModel = {
  id: "findrisc",
  name: "FINDRISC",
  question: "Chance of developing type 2 diabetes in the next 10 years",
  citation:
    "Lindström J, Tuomilehto J. The Diabetes Risk Score. Diabetes Care 2003;26(3):725-731.",
};

/**
 * FINDRISC is the workhorse for this app: it is validated, widely used, and
 * crucially requires NO blood tests. That means it produces a real number on
 * day one, before the user has any labs.
 */
export function findrisc(p: Profile): RiskOutcome {
  // Already diagnosed — a risk-of-onset score is meaningless.
  const hasDiabetes = p.ownConditions.some((c) => DIABETES.includes(c.condition));
  if (hasDiabetes) {
    return {
      status: "not_applicable",
      reason:
        "You already have a diabetes diagnosis, so a score predicting onset doesn't apply. Management targets (HbA1c, blood pressure, lipids) are the relevant measures instead.",
    };
  }

  const age = ageFrom(p.birthYear);
  const bmi = bmiOf(p.anthropometrics);
  const inputs: Record<string, string | number | boolean> = {};
  let score = 0;

  // --- Age ---
  let agePts = 0;
  if (age >= 65) agePts = 4;
  else if (age >= 55) agePts = 3;
  else if (age >= 45) agePts = 2;
  score += agePts;
  inputs["Age"] = `${age} (+${agePts})`;

  // --- BMI ---
  // Note: FINDRISC was validated in a Finnish cohort with 25/30 cut-offs.
  // We keep the validated cut-offs here so the score stays comparable to
  // published bands, and surface the ethnicity adjustment separately rather
  // than silently altering a validated instrument.
  let bmiPts = 0;
  if (bmi > 30) bmiPts = 3;
  else if (bmi >= 25) bmiPts = 1;
  score += bmiPts;
  inputs["BMI"] = `${bmi.toFixed(1)} (+${bmiPts})`;

  // --- Waist ---
  const waist = p.anthropometrics.waistCm;
  let waistPts = 0;
  if (waist != null) {
    if (p.sexAtBirth === "male") {
      if (waist > 102) waistPts = 4;
      else if (waist >= 94) waistPts = 3;
    } else {
      if (waist > 88) waistPts = 4;
      else if (waist >= 80) waistPts = 3;
    }
    inputs["Waist"] = `${waist} cm (+${waistPts})`;
  } else {
    // Don't silently score 0 for an unknown — say so.
    inputs["Waist"] = "not provided (scored 0 — may under-state)";
  }
  score += waistPts;

  // --- Physical activity (>=30 min/day => ~210 min/wk; FINDRISC asks 30min daily) ---
  const active = p.lifestyle.activityMinutesPerWeek >= 150;
  const actPts = active ? 0 : 2;
  score += actPts;
  inputs["Activity"] = `${p.lifestyle.activityMinutesPerWeek} min/wk (+${actPts})`;

  // --- Vegetables/fruit daily ---
  const vegPts = p.lifestyle.eatsVegetablesDaily ? 0 : 1;
  score += vegPts;
  inputs["Daily veg/fruit"] = `${p.lifestyle.eatsVegetablesDaily ? "yes" : "no"} (+${vegPts})`;

  // --- BP medication ---
  const bpPts = p.vitals.onBloodPressureMeds ? 2 : 0;
  score += bpPts;
  inputs["BP medication"] = `${p.vitals.onBloodPressureMeds ? "yes" : "no"} (+${bpPts})`;

  // --- History of high blood glucose ---
  const gluPts = p.everHadHighGlucose ? 5 : 0;
  score += gluPts;
  inputs["Ever high blood glucose"] = `${p.everHadHighGlucose ? "yes" : "no"} (+${gluPts})`;

  // --- Family history: first-degree scores 5, second-degree scores 3 ---
  let famPts = 0;
  let famDetail = "none";
  const diabeticRelatives = p.family.filter((m) =>
    m.conditions.some((c) => DIABETES.includes(c.condition)),
  );
  if (diabeticRelatives.length) {
    const minDegree = Math.min(...diabeticRelatives.map((m) => degreeOf(m.relation)));
    if (minDegree === 1) {
      famPts = 5;
      famDetail = "first-degree relative";
    } else if (minDegree === 2) {
      famPts = 3;
      famDetail = "second-degree relative";
    }
  }
  score += famPts;
  inputs["Family history of diabetes"] = `${famDetail} (+${famPts})`;

  // --- Bands (published FINDRISC 10-year incidence) ---
  let band: RiskBand;
  let probability: number;
  let label: string;
  if (score < 7) {
    band = "low";
    probability = 0.01;
    label = "about 1 in 100";
  } else if (score < 12) {
    band = "slightly_elevated";
    probability = 0.04;
    label = "about 1 in 25";
  } else if (score < 15) {
    band = "moderate";
    probability = 0.17;
    label = "about 1 in 6";
  } else if (score <= 20) {
    band = "high";
    probability = 0.33;
    label = "about 1 in 3";
  } else {
    band = "very_high";
    probability = 0.5;
    label = "about 1 in 2";
  }

  const modifiers: Modifier[] = [];
  if (!active)
    modifiers.push({
      text: "Getting to 150+ minutes of moderate activity per week removes 2 points.",
      impact: "high",
      modifiable: true,
    });
  if (bmiPts > 0) {
    const target = 24.9;
    const h = p.anthropometrics.heightCm / 100;
    const targetKg = target * h * h;
    const delta = p.anthropometrics.weightKg - targetKg;
    modifiers.push({
      text: `Losing ${delta.toFixed(1)} kg would bring BMI under 25 and remove ${bmiPts} point${bmiPts > 1 ? "s" : ""}.`,
      impact: "high",
      modifiable: true,
    });
  }
  if (waistPts > 0) {
    const t = waistThreshold(p.sexAtBirth, p.ethnicity);
    modifiers.push({
      text: `Waist is the strongest single input here (+${waistPts}). Target is under ${t} cm for your sex and ancestry.`,
      impact: "high",
      modifiable: true,
    });
  }
  if (!p.lifestyle.eatsVegetablesDaily)
    modifiers.push({
      text: "Eating vegetables, fruit or berries daily removes 1 point.",
      impact: "low",
      modifiable: true,
    });
  if (famPts > 0)
    modifiers.push({
      text: `Family history contributes +${famPts} and cannot be changed — which is exactly why the modifiable inputs matter more for you than for someone without it.`,
      impact: "high",
      modifiable: false,
    });
  if (agePts > 0)
    modifiers.push({
      text: `Age contributes +${agePts} and will keep rising. Your score drifts up over time unless other inputs improve.`,
      impact: "medium",
      modifiable: false,
    });

  // Ethnicity note — FINDRISC under-detects in South Asian populations.
  const bmiAssessment = assessBmi(p);
  if (bmiAssessment.thresholds.adjusted && bmi >= bmiAssessment.thresholds.overweight && bmi < 25) {
    modifiers.push({
      text: `Your BMI of ${bmi.toFixed(1)} scores 0 on FINDRISC but is already above the ${bmiAssessment.thresholds.overweight} threshold used for your ancestry. This score likely under-states your true risk.`,
      impact: "high",
      modifiable: false,
    });
  }

  return {
    status: "ok",
    value: probability,
    unit: "probability_10yr",
    band,
    label: `${score}/26 — ${label}`,
    summary: `Your FINDRISC score is ${score} out of 26, which corresponds to roughly a ${(probability * 100).toFixed(0)}% chance (${label}) of developing type 2 diabetes within 10 years.`,
    inputsUsed: inputs,
    modifiers: modifiers.sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[a.impact] - rank[b.impact];
    }),
  };
}
