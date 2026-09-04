import {
  CARDIOVASCULAR,
  DIABETES,
  ageFrom,
  bmiOf,
  type Profile,
} from "../schema/index.ts";
import type { MissingInput, Modifier, RiskBand, RiskModel, RiskOutcome } from "./types.ts";
import { riskEnhancers } from "./ascvd.ts";

export const FRS_SIMPLE_MODEL: RiskModel = {
  id: "frs_simple",
  name: "Framingham (no bloodwork)",
  question: "Chance of a cardiovascular event in the next 10 years",
  citation:
    "D'Agostino RB et al. General cardiovascular risk profile for use in primary care. Circulation 2008;117:743-753 (office-based/BMI model).",
};

/**
 * The office-based Framingham model substitutes BMI for the lipid panel, so it
 * produces a real cardiovascular number with no blood tests at all — and it is
 * validated from age 30 rather than ASCVD's 40.
 *
 * That combination is why it's here: without it, anyone under 40 or without a
 * recent lipid panel sees nothing but "not applicable" on the whole
 * cardiovascular side, which is useless.
 *
 * Coefficients verified against the reference implementation's worked example
 * (male, 55, BMI 30, SBP 140, untreated, non-smoker, non-diabetic = 16.7%).
 */
const COEF = {
  male: {
    lnAge: 3.11296,
    lnBmi: 0.79277,
    lnUntreatedSbp: 1.85508,
    lnTreatedSbp: 1.92672,
    smoker: 0.70953,
    diabetes: 0.5316,
    mean: 23.9388,
    s10: 0.88431,
  },
  female: {
    lnAge: 2.72107,
    lnBmi: 0.51125,
    lnUntreatedSbp: 2.81291,
    lnTreatedSbp: 2.88267,
    smoker: 0.61868,
    diabetes: 0.77763,
    mean: 26.0145,
    s10: 0.94833,
  },
} as const;

export function frsSimple(p: Profile): RiskOutcome {
  const age = ageFrom(p.birthYear);

  if (p.ownConditions.some((c) => CARDIOVASCULAR.includes(c.condition))) {
    return {
      status: "not_applicable",
      reason:
        "You already have established cardiovascular disease, so a first-event prediction doesn't apply. Secondary prevention targets are the relevant measures — a conversation for your doctor.",
    };
  }

  if (p.sexAtBirth === "intersex") {
    return {
      status: "not_applicable",
      reason:
        "This model was derived with binary sex strata only and has no validated form for intersex individuals.",
    };
  }

  if (age < 30 || age > 74) {
    return {
      status: "not_applicable",
      reason:
        age < 30
          ? `This model is validated for ages 30–74, and you're ${age}. At your age the meaningful question is lifetime risk and the direction your inputs are heading, not a 10-year percentage.`
          : `This model is validated for ages 30–74, and you're ${age}. Above 74 the ASCVD equations remain usable to 79; beyond that decisions are individualised.`,
    };
  }

  const sbp = p.vitals.systolic;
  if (sbp == null) {
    return {
      status: "partial",
      summary:
        "One input away from a real cardiovascular number — and it's the only one you can measure yourself, no doctor or blood test needed.",
      missing: [
        {
          label: "Systolic blood pressure",
          why: "A home cuff costs about $40. This is the single highest-value number missing from your profile.",
        },
      ],
      modifiers: [],
    };
  }

  const bmi = bmiOf(p.anthropometrics);
  const sex = p.sexAtBirth as "male" | "female";
  const c = COEF[sex];
  const treated = p.vitals.onBloodPressureMeds;
  const smoker = p.lifestyle.smoking === "current";
  const diabetic = p.ownConditions.some((x) => DIABETES.includes(x.condition));

  // Untreated and treated SBP enter as separate terms; the inactive one is
  // set to 1 so its log contributes zero.
  const sum =
    Math.log(age) * c.lnAge +
    Math.log(bmi) * c.lnBmi +
    Math.log(treated ? sbp : 1) * c.lnTreatedSbp +
    Math.log(treated ? 1 : sbp) * c.lnUntreatedSbp +
    (smoker ? c.smoker : 0) +
    (diabetic ? c.diabetes : 0);

  const raw = (1 - Math.pow(c.s10, Math.exp(sum - c.mean))) * 100;
  // The published model is reported clamped to 1–30%.
  const pct = Math.min(30, Math.max(1, raw));

  let band: RiskBand;
  if (pct < 5) band = "low";
  else if (pct < 10) band = "slightly_elevated";
  else if (pct < 20) band = "moderate";
  else band = "high";

  const modifiers: Modifier[] = [];
  if (smoker)
    modifiers.push({
      text: "Stopping smoking is the largest single change available here — worth more than any medication.",
      impact: "high",
      modifiable: true,
    });
  if (sbp >= 130)
    modifiers.push({
      text: `Systolic blood pressure is ${sbp}. Every 10 mmHg down meaningfully lowers this number.`,
      impact: "high",
      modifiable: true,
    });
  if (bmi >= 25)
    modifiers.push({
      text: `BMI of ${bmi.toFixed(1)} is doing real work in this model — it stands in for the lipid panel here.`,
      impact: "high",
      modifiable: true,
    });
  for (const e of riskEnhancers(p))
    modifiers.push({ text: e, impact: "high", modifiable: false });

  const missingLabs: MissingInput[] = p.labs.some((l) => l.analyte === "ldl_mgdl")
    ? []
    : [];

  return {
    status: "ok",
    value: pct / 100,
    unit: "probability_10yr",
    band,
    label: `${pct.toFixed(1)}%`,
    summary:
      `Your estimated 10-year risk of a cardiovascular event is ${pct.toFixed(1)}%. ` +
      `This uses BMI in place of a lipid panel, so it's a good screening estimate but less precise than the lab-based ASCVD equation — get a lipid panel and that becomes available too.` +
      (missingLabs.length ? "" : ""),
    inputsUsed: {
      Age: age,
      Sex: sex,
      BMI: bmi.toFixed(1),
      "Systolic BP": `${sbp} mmHg`,
      "On BP medication": treated,
      "Current smoker": smoker,
      Diabetes: diabetic,
    },
    modifiers,
  };
}
