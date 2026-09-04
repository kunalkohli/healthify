/**
 * Core data schema. PURE TYPESCRIPT — no DOM, no React, no platform imports.
 * Everything in src/core/ must stay portable so a native port is a UI rewrite only.
 */
import { z } from "zod";

export const SexAtBirth = z.enum(["male", "female", "intersex"]);
export type SexAtBirth = z.infer<typeof SexAtBirth>;

/**
 * Ethnicity matters clinically, not cosmetically:
 *  - ASCVD Pooled Cohort Equations have distinct coefficient sets for Black vs White/Other
 *  - ADA/WHO lower the diabetes-screening BMI threshold to 23 for Asian ancestry
 */
export const Ethnicity = z.enum([
  "south_asian",
  "east_asian",
  "southeast_asian",
  "black_african",
  "black_caribbean",
  "white_european",
  "hispanic_latino",
  "middle_eastern",
  "indigenous",
  "pacific_islander",
  "mixed_other",
]);
export type Ethnicity = z.infer<typeof Ethnicity>;

export const ETHNICITY_LABELS: Record<Ethnicity, string> = {
  south_asian: "South Asian",
  east_asian: "East Asian",
  southeast_asian: "Southeast Asian",
  black_african: "Black African",
  black_caribbean: "Black Caribbean",
  white_european: "White / European",
  hispanic_latino: "Hispanic / Latino",
  middle_eastern: "Middle Eastern",
  indigenous: "Indigenous",
  pacific_islander: "Pacific Islander",
  mixed_other: "Mixed / Other",
};

export const Relation = z.enum([
  "mother",
  "father",
  "sister",
  "brother",
  "daughter",
  "son",
  "maternal_grandmother",
  "maternal_grandfather",
  "paternal_grandmother",
  "paternal_grandfather",
  "maternal_aunt",
  "maternal_uncle",
  "paternal_aunt",
  "paternal_uncle",
  "cousin",
]);
export type Relation = z.infer<typeof Relation>;

export const RELATION_LABELS: Record<Relation, string> = {
  mother: "Mother",
  father: "Father",
  sister: "Sister",
  brother: "Brother",
  daughter: "Daughter",
  son: "Son",
  maternal_grandmother: "Grandmother (mother's side)",
  maternal_grandfather: "Grandfather (mother's side)",
  paternal_grandmother: "Grandmother (father's side)",
  paternal_grandfather: "Grandfather (father's side)",
  maternal_aunt: "Aunt (mother's side)",
  maternal_uncle: "Uncle (mother's side)",
  paternal_aunt: "Aunt (father's side)",
  paternal_uncle: "Uncle (father's side)",
  cousin: "Cousin",
};

/** First-degree relatives share ~50% of genes. Risk maths depends on this distinction. */
export const FIRST_DEGREE: Relation[] = [
  "mother",
  "father",
  "sister",
  "brother",
  "daughter",
  "son",
];

export const SECOND_DEGREE: Relation[] = [
  "maternal_grandmother",
  "maternal_grandfather",
  "paternal_grandmother",
  "paternal_grandfather",
  "maternal_aunt",
  "maternal_uncle",
  "paternal_aunt",
  "paternal_uncle",
];

export function degreeOf(r: Relation): 1 | 2 | 3 {
  if (FIRST_DEGREE.includes(r)) return 1;
  if (SECOND_DEGREE.includes(r)) return 2;
  return 3;
}

export function relationSex(r: Relation): SexAtBirth | null {
  if (
    [
      "mother",
      "sister",
      "daughter",
      "maternal_grandmother",
      "paternal_grandmother",
      "maternal_aunt",
      "paternal_aunt",
    ].includes(r)
  )
    return "female";
  if (
    [
      "father",
      "brother",
      "son",
      "maternal_grandfather",
      "paternal_grandfather",
      "maternal_uncle",
      "paternal_uncle",
    ].includes(r)
  )
    return "male";
  return null;
}

export function maternalOrPaternal(r: Relation): "maternal" | "paternal" | null {
  if (r.startsWith("maternal")) return "maternal";
  if (r.startsWith("paternal")) return "paternal";
  return null;
}

/** Controlled vocabulary. Free text would make the risk rules unreliable. */
export const Condition = z.enum([
  "type2_diabetes",
  "type1_diabetes",
  "gestational_diabetes",
  "prediabetes",
  "heart_attack",
  "coronary_artery_disease",
  "stroke",
  "heart_failure",
  "atrial_fibrillation",
  "hypertension",
  "high_cholesterol",
  "colorectal_cancer",
  "breast_cancer",
  "ovarian_cancer",
  "endometrial_cancer",
  "prostate_cancer",
  "pancreatic_cancer",
  "gastric_cancer",
  "lung_cancer",
  "kidney_cancer",
  "melanoma",
  "other_cancer",
  "alzheimers",
  "parkinsons",
  "osteoporosis",
  "rheumatoid_arthritis",
  "thyroid_disease",
  "kidney_disease",
  "liver_disease",
  "asthma",
  "copd",
  "depression",
  "anxiety",
  "celiac",
  "ibd",
  "sleep_apnea",
  "other",
]);
export type Condition = z.infer<typeof Condition>;

export const CONDITION_LABELS: Record<Condition, string> = {
  type2_diabetes: "Type 2 diabetes",
  type1_diabetes: "Type 1 diabetes",
  gestational_diabetes: "Gestational diabetes",
  prediabetes: "Prediabetes",
  heart_attack: "Heart attack",
  coronary_artery_disease: "Coronary artery disease",
  stroke: "Stroke",
  heart_failure: "Heart failure",
  atrial_fibrillation: "Atrial fibrillation",
  hypertension: "High blood pressure",
  high_cholesterol: "High cholesterol",
  colorectal_cancer: "Colorectal cancer",
  breast_cancer: "Breast cancer",
  ovarian_cancer: "Ovarian cancer",
  endometrial_cancer: "Endometrial (uterine) cancer",
  prostate_cancer: "Prostate cancer",
  pancreatic_cancer: "Pancreatic cancer",
  gastric_cancer: "Stomach cancer",
  lung_cancer: "Lung cancer",
  kidney_cancer: "Kidney cancer",
  melanoma: "Melanoma",
  other_cancer: "Other cancer",
  alzheimers: "Alzheimer's / dementia",
  parkinsons: "Parkinson's",
  osteoporosis: "Osteoporosis",
  rheumatoid_arthritis: "Rheumatoid arthritis",
  thyroid_disease: "Thyroid disease",
  kidney_disease: "Kidney disease",
  liver_disease: "Liver disease",
  asthma: "Asthma",
  copd: "COPD",
  depression: "Depression",
  anxiety: "Anxiety",
  celiac: "Celiac disease",
  ibd: "IBD (Crohn's / colitis)",
  sleep_apnea: "Sleep apnea",
  other: "Other",
};

/** Condition groupings the risk rules reason over. */
export const CARDIOVASCULAR: Condition[] = [
  "heart_attack",
  "coronary_artery_disease",
  "stroke",
  "heart_failure",
];

export const DIABETES: Condition[] = ["type2_diabetes", "type1_diabetes"];

export const CANCERS: Condition[] = [
  "colorectal_cancer",
  "breast_cancer",
  "ovarian_cancer",
  "endometrial_cancer",
  "prostate_cancer",
  "pancreatic_cancer",
  "gastric_cancer",
  "lung_cancer",
  "kidney_cancer",
  "melanoma",
  "other_cancer",
];

/** Cancers in the Lynch syndrome spectrum (Amsterdam II / revised Bethesda). */
export const LYNCH_SPECTRUM: Condition[] = [
  "colorectal_cancer",
  "endometrial_cancer",
  "gastric_cancer",
  "kidney_cancer",
  "pancreatic_cancer",
];

/** Cancers in the hereditary breast/ovarian spectrum (NCCN referral criteria). */
export const HBOC_SPECTRUM: Condition[] = [
  "breast_cancer",
  "ovarian_cancer",
  "pancreatic_cancer",
  "prostate_cancer",
];

export const FamilyConditionEntry = z.object({
  id: z.string(),
  condition: Condition,
  /** Age the relative was diagnosed. Null = known to have it, age unknown. */
  ageAtDiagnosis: z.number().int().min(0).max(120).nullable(),
  note: z.string().optional(),
});
export type FamilyConditionEntry = z.infer<typeof FamilyConditionEntry>;

export const FamilyMember = z.object({
  id: z.string(),
  relation: Relation,
  alive: z.boolean().nullable(),
  ageNowOrAtDeath: z.number().int().min(0).max(120).nullable(),
  causeOfDeath: Condition.nullable().optional(),
  conditions: z.array(FamilyConditionEntry),
});
export type FamilyMember = z.infer<typeof FamilyMember>;

export const SmokingStatus = z.enum(["never", "former", "current"]);
export type SmokingStatus = z.infer<typeof SmokingStatus>;

export const Lifestyle = z.object({
  smoking: SmokingStatus,
  /** Minutes of moderate+ activity per week. */
  activityMinutesPerWeek: z.number().min(0).max(2000),
  /** Standard alcoholic drinks per week. */
  alcoholPerWeek: z.number().min(0).max(200),
  /** Eats fruit/vegetables/berries most days — a FINDRISC input. */
  eatsVegetablesDaily: z.boolean(),
  averageSleepHours: z.number().min(0).max(24),
});
export type Lifestyle = z.infer<typeof Lifestyle>;

/** Lab analytes we can act on. Values always stored in the canonical unit noted. */
export const Analyte = z.enum([
  "hba1c_pct",
  "fasting_glucose_mgdl",
  "total_cholesterol_mgdl",
  "ldl_mgdl",
  "hdl_mgdl",
  "triglycerides_mgdl",
  "lipoprotein_a_nmoll",
  "apob_mgdl",
  "crp_mgl",
  "alt_ul",
  "creatinine_mgdl",
  "egfr",
  "tsh_miul",
  "vitamin_d_ngml",
  "ferritin_ngml",
]);
export type Analyte = z.infer<typeof Analyte>;

export const ANALYTE_META: Record<
  Analyte,
  { label: string; unit: string; optimal?: [number, number] }
> = {
  hba1c_pct: { label: "HbA1c", unit: "%", optimal: [4.0, 5.6] },
  fasting_glucose_mgdl: { label: "Fasting glucose", unit: "mg/dL", optimal: [70, 99] },
  total_cholesterol_mgdl: { label: "Total cholesterol", unit: "mg/dL", optimal: [125, 200] },
  ldl_mgdl: { label: "LDL-C", unit: "mg/dL", optimal: [0, 100] },
  hdl_mgdl: { label: "HDL-C", unit: "mg/dL", optimal: [40, 100] },
  triglycerides_mgdl: { label: "Triglycerides", unit: "mg/dL", optimal: [0, 150] },
  lipoprotein_a_nmoll: { label: "Lipoprotein(a)", unit: "nmol/L", optimal: [0, 75] },
  apob_mgdl: { label: "ApoB", unit: "mg/dL", optimal: [0, 90] },
  crp_mgl: { label: "hs-CRP", unit: "mg/L", optimal: [0, 1] },
  alt_ul: { label: "ALT", unit: "U/L", optimal: [0, 33] },
  creatinine_mgdl: { label: "Creatinine", unit: "mg/dL", optimal: [0.6, 1.3] },
  egfr: { label: "eGFR", unit: "mL/min/1.73m²", optimal: [90, 200] },
  tsh_miul: { label: "TSH", unit: "mIU/L", optimal: [0.4, 4.0] },
  vitamin_d_ngml: { label: "Vitamin D", unit: "ng/mL", optimal: [30, 80] },
  ferritin_ngml: { label: "Ferritin", unit: "ng/mL", optimal: [30, 300] },
};

export const LabResult = z.object({
  id: z.string(),
  analyte: Analyte,
  value: z.number(),
  takenAt: z.string(), // ISO date
  note: z.string().optional(),
});
export type LabResult = z.infer<typeof LabResult>;

export const Vitals = z.object({
  systolic: z.number().min(60).max(260).nullable(),
  diastolic: z.number().min(30).max(180).nullable(),
  restingHeartRate: z.number().min(30).max(200).nullable(),
  onBloodPressureMeds: z.boolean(),
});
export type Vitals = z.infer<typeof Vitals>;

export const Anthropometrics = z.object({
  heightCm: z.number().min(50).max(260),
  weightKg: z.number().min(20).max(400),
  waistCm: z.number().min(40).max(250).nullable(),
});
export type Anthropometrics = z.infer<typeof Anthropometrics>;

export const Profile = z.object({
  name: z.string().optional(),
  birthYear: z.number().int().min(1900).max(2100),
  sexAtBirth: SexAtBirth,
  ethnicity: z.array(Ethnicity).min(1),
  anthropometrics: Anthropometrics,
  vitals: Vitals,
  lifestyle: Lifestyle,
  /** Conditions the user personally has. */
  ownConditions: z.array(
    z.object({
      id: z.string(),
      condition: Condition,
      diagnosedAge: z.number().int().nullable(),
    }),
  ),
  medications: z.array(z.object({ id: z.string(), name: z.string(), note: z.string().optional() })),
  allergies: z.array(z.string()),
  family: z.array(FamilyMember),
  labs: z.array(LabResult),
  everHadHighGlucose: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Profile = z.infer<typeof Profile>;

export const MemoryCategory = z.enum([
  "preference",
  "constraint",
  "goal",
  "history",
  "context",
]);
export type MemoryCategory = z.infer<typeof MemoryCategory>;

export const MemoryFact = z.object({
  id: z.string(),
  text: z.string(),
  category: MemoryCategory,
  createdAt: z.string(),
  /** Where this came from, so you can audit why the coach believes something. */
  sourceSessionId: z.string().nullable(),
  approved: z.boolean(),
});
export type MemoryFact = z.infer<typeof MemoryFact>;

export const ChatMessage = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const JournalEntry = z.object({
  id: z.string(),
  date: z.string(), // YYYY-MM-DD
  kind: z.enum(["meal", "weight", "symptom", "note", "activity"]),
  text: z.string(),
  value: z.number().nullable().optional(),
  createdAt: z.string(),
});
export type JournalEntry = z.infer<typeof JournalEntry>;

// ---------- derived helpers ----------

export function ageFrom(birthYear: number, now = new Date()): number {
  return now.getFullYear() - birthYear;
}

export function bmiOf(a: Anthropometrics): number {
  const m = a.heightCm / 100;
  return a.weightKg / (m * m);
}

export function emptyProfile(): Profile {
  const now = new Date().toISOString();
  return {
    birthYear: new Date().getFullYear() - 35,
    sexAtBirth: "male",
    ethnicity: [],
    anthropometrics: { heightCm: 175, weightKg: 75, waistCm: null },
    vitals: {
      systolic: null,
      diastolic: null,
      restingHeartRate: null,
      onBloodPressureMeds: false,
    },
    lifestyle: {
      smoking: "never",
      activityMinutesPerWeek: 150,
      alcoholPerWeek: 0,
      eatsVegetablesDaily: true,
      averageSleepHours: 7,
    },
    ownConditions: [],
    medications: [],
    allergies: [],
    family: [],
    labs: [],
    everHadHighGlucose: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
