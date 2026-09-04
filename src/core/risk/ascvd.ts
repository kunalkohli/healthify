import {
  CARDIOVASCULAR,
  DIABETES,
  ageFrom,
  degreeOf,
  relationSex,
  type Analyte,
  type Profile,
} from "../schema/index.ts";
import type { MissingInput, Modifier, RiskBand, RiskModel, RiskOutcome } from "./types.ts";

export const ASCVD_MODEL: RiskModel = {
  id: "ascvd",
  name: "ASCVD 10-year risk",
  question: "Chance of a heart attack or stroke in the next 10 years",
  citation:
    "Goff DC et al. 2013 ACC/AHA Pooled Cohort Equations. Circulation 2014;129:S49-S73.",
};

function latestLab(p: Profile, a: Analyte): number | null {
  const rows = p.labs
    .filter((l) => l.analyte === a)
    .sort((x, y) => y.takenAt.localeCompare(x.takenAt));
  return rows.length ? rows[0].value : null;
}

/**
 * The Pooled Cohort Equations were derived with only two race strata:
 * "African American" and "White/Other". That is a real limitation of the
 * instrument, not a modelling choice on our part — and it is why the ACC/AHA
 * adds "risk enhancers" (including South Asian ancestry) on top.
 */
function pceRace(p: Profile): "african_american" | "white_other" {
  return p.ethnicity.includes("black_african") || p.ethnicity.includes("black_caribbean")
    ? "african_american"
    : "white_other";
}

type Coeffs = {
  s10: number;
  mean: number;
  lnAge: number;
  lnAgeSq?: number;
  lnTc: number;
  lnAgeLnTc?: number;
  lnHdl: number;
  lnAgeLnHdl?: number;
  lnSbpTreated: number;
  lnAgeLnSbpTreated?: number;
  lnSbpUntreated: number;
  lnAgeLnSbpUntreated?: number;
  smoker: number;
  lnAgeSmoker?: number;
  diabetes: number;
};

const COEFFS: Record<string, Coeffs> = {
  female_white_other: {
    s10: 0.9665,
    mean: -29.18,
    lnAge: -29.799,
    lnAgeSq: 4.884,
    lnTc: 13.54,
    lnAgeLnTc: -3.114,
    lnHdl: -13.578,
    lnAgeLnHdl: 3.149,
    lnSbpTreated: 2.019,
    lnSbpUntreated: 1.957,
    smoker: 7.574,
    lnAgeSmoker: -1.665,
    diabetes: 0.661,
  },
  female_african_american: {
    s10: 0.9533,
    mean: 86.61,
    lnAge: 17.114,
    lnTc: 0.94,
    lnHdl: -18.92,
    lnAgeLnHdl: 4.475,
    lnSbpTreated: 29.291,
    lnAgeLnSbpTreated: -6.432,
    lnSbpUntreated: 27.82,
    lnAgeLnSbpUntreated: -6.087,
    smoker: 0.691,
    diabetes: 0.874,
  },
  male_white_other: {
    s10: 0.9144,
    mean: 61.18,
    lnAge: 12.344,
    lnTc: 11.853,
    lnAgeLnTc: -2.664,
    lnHdl: -7.99,
    lnAgeLnHdl: 1.769,
    lnSbpTreated: 1.797,
    lnSbpUntreated: 1.764,
    smoker: 7.837,
    lnAgeSmoker: -1.795,
    diabetes: 0.658,
  },
  male_african_american: {
    s10: 0.8954,
    mean: 19.54,
    lnAge: 2.469,
    lnTc: 0.302,
    lnHdl: -0.307,
    lnSbpTreated: 1.916,
    lnSbpUntreated: 1.809,
    smoker: 0.549,
    diabetes: 0.645,
  },
};

/** ACC/AHA 2018 risk enhancers — applied on top of the PCE number. */
export function riskEnhancers(p: Profile): string[] {
  const out: string[] = [];

  // Premature ASCVD in a first-degree relative: male <55, female <65.
  for (const m of p.family) {
    if (degreeOf(m.relation) !== 1) continue;
    for (const c of m.conditions) {
      if (!CARDIOVASCULAR.includes(c.condition)) continue;
      const sex = relationSex(m.relation);
      const cut = sex === "female" ? 65 : 55;
      if (c.ageAtDiagnosis != null && c.ageAtDiagnosis < cut) {
        out.push(
          `Premature cardiovascular disease in a first-degree relative (${m.relation.replace(/_/g, " ")}, age ${c.ageAtDiagnosis}).`,
        );
      }
    }
  }

  if (p.ethnicity.includes("south_asian"))
    out.push(
      "South Asian ancestry — an ACC/AHA-recognised risk enhancer; the Pooled Cohort Equations under-estimate risk in this group.",
    );

  const ldl = latestLab(p, "ldl_mgdl");
  if (ldl != null && ldl >= 160)
    out.push(`LDL-C persistently elevated at ${ldl} mg/dL (≥160).`);

  const lpa = latestLab(p, "lipoprotein_a_nmoll");
  if (lpa != null && lpa >= 125) out.push(`Lipoprotein(a) elevated at ${lpa} nmol/L (≥125).`);

  const apob = latestLab(p, "apob_mgdl");
  if (apob != null && apob >= 130) out.push(`ApoB elevated at ${apob} mg/dL (≥130).`);

  const crp = latestLab(p, "crp_mgl");
  if (crp != null && crp >= 2) out.push(`hs-CRP elevated at ${crp} mg/L (≥2.0).`);

  const tg = latestLab(p, "triglycerides_mgdl");
  if (tg != null && tg >= 175) out.push(`Triglycerides persistently ≥175 mg/dL (${tg}).`);

  if (p.ownConditions.some((c) => c.condition === "kidney_disease"))
    out.push("Chronic kidney disease.");
  if (p.ownConditions.some((c) => c.condition === "rheumatoid_arthritis"))
    out.push("Chronic inflammatory condition (rheumatoid arthritis).");

  return out;
}

export function ascvd(p: Profile): RiskOutcome {
  const age = ageFrom(p.birthYear);

  // Established disease — prevention maths doesn't apply.
  if (p.ownConditions.some((c) => CARDIOVASCULAR.includes(c.condition))) {
    return {
      status: "not_applicable",
      reason:
        "You already have established cardiovascular disease. The Pooled Cohort Equations estimate *first* events only — secondary prevention targets apply to you instead, which is a conversation for your doctor.",
    };
  }

  if (p.sexAtBirth === "intersex") {
    return {
      status: "not_applicable",
      reason:
        "The Pooled Cohort Equations were derived with binary sex strata only and have no validated form for intersex individuals. A clinician should assess this directly rather than have an app guess.",
    };
  }

  // Hard validity boundary. Extrapolating outside 40-79 is exactly the kind of
  // confident nonsense an LLM would produce, so the engine refuses.
  if (age < 40 || age > 79) {
    const enh = riskEnhancers(p);
    return {
      status: "not_applicable",
      reason:
        age < 40
          ? `The Pooled Cohort Equations are only validated for ages 40–79, and you're ${age}. No trustworthy 10-year number exists for you yet. What matters at your age is lifetime risk and the trajectory of your inputs — blood pressure, LDL/ApoB, weight, activity, smoking.${enh.length ? ` Note these already apply to you: ${enh.join(" ")}` : ""}`
          : `The Pooled Cohort Equations are only validated for ages 40–79, and you're ${age}. Above 79 the model is unreliable and decisions are individualised.`,
    };
  }

  // Gather required inputs.
  const tc = latestLab(p, "total_cholesterol_mgdl");
  const hdl = latestLab(p, "hdl_mgdl");
  const sbp = p.vitals.systolic;

  const missing: MissingInput[] = [];
  if (tc == null)
    missing.push({
      analyte: "total_cholesterol_mgdl",
      label: "Total cholesterol",
      why: "A required input to the equation. Comes from a standard lipid panel.",
    });
  if (hdl == null)
    missing.push({
      analyte: "hdl_mgdl",
      label: "HDL cholesterol",
      why: "A required input. Same lipid panel as total cholesterol.",
    });
  if (sbp == null)
    missing.push({
      label: "Systolic blood pressure",
      why: "A required input. You can measure this at home with a cuff — no doctor needed.",
    });

  const enhancers = riskEnhancers(p);
  const enhancerModifiers: Modifier[] = enhancers.map((e) => ({
    text: e,
    impact: "high" as const,
    modifiable: false,
  }));

  if (missing.length) {
    return {
      status: "partial",
      summary: `I can't give you a trustworthy 10-year cardiovascular number yet — ${missing.length} required input${missing.length > 1 ? "s are" : " is"} missing. Rather than guess, here's exactly what to get.`,
      missing,
      provisional: enhancers.length
        ? {
            label: "Risk enhancers already present",
            band: "moderate",
            detail: enhancers.join(" "),
          }
        : undefined,
      modifiers: enhancerModifiers,
    };
  }

  const isDiabetic = p.ownConditions.some((c) => DIABETES.includes(c.condition));
  const isSmoker = p.lifestyle.smoking === "current";
  const treated = p.vitals.onBloodPressureMeds;

  const key = `${p.sexAtBirth}_${pceRace(p)}`;
  const c = COEFFS[key];

  const lnAge = Math.log(age);
  const lnTc = Math.log(tc!);
  const lnHdl = Math.log(hdl!);
  const lnSbp = Math.log(sbp!);

  let sum = 0;
  sum += c.lnAge * lnAge;
  if (c.lnAgeSq) sum += c.lnAgeSq * lnAge * lnAge;
  sum += c.lnTc * lnTc;
  if (c.lnAgeLnTc) sum += c.lnAgeLnTc * lnAge * lnTc;
  sum += c.lnHdl * lnHdl;
  if (c.lnAgeLnHdl) sum += c.lnAgeLnHdl * lnAge * lnHdl;

  if (treated) {
    sum += c.lnSbpTreated * lnSbp;
    if (c.lnAgeLnSbpTreated) sum += c.lnAgeLnSbpTreated * lnAge * lnSbp;
  } else {
    sum += c.lnSbpUntreated * lnSbp;
    if (c.lnAgeLnSbpUntreated) sum += c.lnAgeLnSbpUntreated * lnAge * lnSbp;
  }

  if (isSmoker) {
    sum += c.smoker;
    if (c.lnAgeSmoker) sum += c.lnAgeSmoker * lnAge;
  }
  if (isDiabetic) sum += c.diabetes;

  const risk = 1 - Math.pow(c.s10, Math.exp(sum - c.mean));
  const pct = risk * 100;

  // ACC/AHA bands.
  let band: RiskBand;
  if (pct < 5) band = "low";
  else if (pct < 7.5) band = "slightly_elevated";
  else if (pct < 20) band = "moderate";
  else band = "high";

  const modifiers: Modifier[] = [];
  if (isSmoker)
    modifiers.push({
      text: "Stopping smoking is the single largest change available to you here — it is worth more than any medication.",
      impact: "high",
      modifiable: true,
    });
  if (sbp! >= 130)
    modifiers.push({
      text: `Systolic blood pressure is ${sbp}. Getting it under 120 meaningfully lowers this number.`,
      impact: "high",
      modifiable: true,
    });
  const ldl = latestLab(p, "ldl_mgdl");
  if (ldl != null && ldl >= 100)
    modifiers.push({
      text: `LDL-C is ${ldl} mg/dL. This is the most directly treatable input, through diet and, if warranted, statins.`,
      impact: "high",
      modifiable: true,
    });
  if (hdl! < 40)
    modifiers.push({
      text: `HDL is ${hdl} mg/dL, which is low. Aerobic exercise is the most reliable way to raise it.`,
      impact: "medium",
      modifiable: true,
    });
  modifiers.push(...enhancerModifiers);

  return {
    status: "ok",
    value: risk,
    unit: "probability_10yr",
    band,
    label: `${pct.toFixed(1)}%`,
    summary:
      `Your estimated 10-year risk of a first heart attack or stroke is ${pct.toFixed(1)}%.` +
      (enhancers.length
        ? ` Note that ${enhancers.length} risk enhancer${enhancers.length > 1 ? "s" : ""} apply to you that the equation does not capture, so treat this as a floor rather than a precise figure.`
        : ""),
    inputsUsed: {
      Age: age,
      Sex: p.sexAtBirth,
      "PCE race stratum": pceRace(p),
      "Total cholesterol": `${tc} mg/dL`,
      "HDL-C": `${hdl} mg/dL`,
      "Systolic BP": `${sbp} mmHg`,
      "On BP medication": treated,
      Diabetes: isDiabetic,
      "Current smoker": isSmoker,
    },
    modifiers,
  };
}
