import type { Ethnicity, Profile, SexAtBirth } from "../schema/index.ts";
import { bmiOf } from "../schema/index.ts";

/**
 * BMI thresholds are not universal. WHO and NICE both recommend lowered
 * cut-offs for South Asian, Chinese, other Asian, Middle Eastern, Black African
 * and African-Caribbean populations, because cardiometabolic risk appears at a
 * lower BMI. The ADA likewise recommends diabetes screening from BMI 23 (not 25)
 * in Asian Americans.
 *
 * Using the generic 25/30 cut-offs for someone of South Asian ancestry
 * systematically under-states their risk. This is a common and consequential bug.
 */
const LOWER_THRESHOLD_ETHNICITIES: Ethnicity[] = [
  "south_asian",
  "east_asian",
  "southeast_asian",
  "middle_eastern",
  "black_african",
  "black_caribbean",
];

export type BmiThresholds = {
  overweight: number;
  obese: number;
  adjusted: boolean;
  rationale: string;
};

export function bmiThresholds(ethnicity: Ethnicity[]): BmiThresholds {
  const adjusted = ethnicity.some((e) => LOWER_THRESHOLD_ETHNICITIES.includes(e));
  return adjusted
    ? {
        overweight: 23,
        obese: 27.5,
        adjusted: true,
        rationale:
          "Lowered cut-offs applied (WHO/NICE/ADA) because cardiometabolic risk appears at a lower BMI in your ancestry group.",
      }
    : {
        overweight: 25,
        obese: 30,
        adjusted: false,
        rationale: "Standard WHO cut-offs.",
      };
}

export type BmiAssessment = {
  bmi: number;
  category: "underweight" | "healthy" | "overweight" | "obese";
  thresholds: BmiThresholds;
};

export function assessBmi(p: Profile): BmiAssessment {
  const bmi = bmiOf(p.anthropometrics);
  const t = bmiThresholds(p.ethnicity);
  let category: BmiAssessment["category"] = "healthy";
  if (bmi < 18.5) category = "underweight";
  else if (bmi >= t.obese) category = "obese";
  else if (bmi >= t.overweight) category = "overweight";
  return { bmi, category, thresholds: t };
}

/**
 * Waist circumference is a better predictor of cardiometabolic risk than BMI,
 * and it also has ethnicity-specific cut-offs (IDF criteria).
 */
export function waistThreshold(sex: SexAtBirth, ethnicity: Ethnicity[]): number | null {
  const asian = ethnicity.some((e) =>
    ["south_asian", "east_asian", "southeast_asian"].includes(e),
  );
  if (sex === "male") return asian ? 90 : 94;
  if (sex === "female") return asian ? 80 : 80;
  return null;
}

export function waistIsElevated(p: Profile): boolean | null {
  const w = p.anthropometrics.waistCm;
  if (w == null) return null;
  const t = waistThreshold(p.sexAtBirth, p.ethnicity);
  if (t == null) return null;
  return w >= t;
}
