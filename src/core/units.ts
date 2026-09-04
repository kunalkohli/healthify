/**
 * Unit conversion. PURE — no platform imports.
 *
 * Design rule: the store and the entire risk engine only ever see metric
 * (cm, kg, mg/dL). Conversion happens at the UI boundary and nowhere else.
 * If imperial values leaked into the calculators, every published coefficient
 * would silently be wrong.
 */

export type UnitSystem = "metric" | "imperial";

export type LabUnitSystem = "us" | "si";

// ---------- length ----------

export const cmToIn = (cm: number) => cm / 2.54;
export const inToCm = (inch: number) => inch * 2.54;

export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const totalIn = cmToIn(cm);
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round((totalIn - ft * 12) * 10) / 10;
  // Guard the 11.95" -> 12" rounding case.
  if (inch >= 12) return { ft: ft + 1, inch: 0 };
  return { ft, inch };
}

export const ftInToCm = (ft: number, inch: number) => inToCm(ft * 12 + inch);

// ---------- mass ----------

export const kgToLb = (kg: number) => kg * 2.2046226218;
export const lbToKg = (lb: number) => lb / 2.2046226218;

// ---------- lab analytes ----------

/**
 * Molar-mass conversion factors, mg/dL per mmol/L.
 * Cholesterol fractions share a factor; triglycerides and glucose do not.
 */
const LAB_FACTORS: Record<string, number> = {
  fasting_glucose_mgdl: 18.0182,
  total_cholesterol_mgdl: 38.67,
  ldl_mgdl: 38.67,
  hdl_mgdl: 38.67,
  triglycerides_mgdl: 88.57,
};

/** HbA1c has its own relationship: IFCC mmol/mol vs DCCT %. */
export const hba1cPctToMmolMol = (pct: number) => (pct - 2.15) * 10.929;
export const hba1cMmolMolToPct = (mmol: number) => mmol / 10.929 + 2.15;

export function labHasSiVariant(analyte: string): boolean {
  return analyte in LAB_FACTORS || analyte === "hba1c_pct";
}

export function labUnitLabel(analyte: string, sys: LabUnitSystem, fallback: string): string {
  if (sys === "us") return fallback;
  if (analyte === "hba1c_pct") return "mmol/mol";
  if (analyte in LAB_FACTORS) return "mmol/L";
  return fallback;
}

/** Canonical (US) value -> display value in the chosen system. */
export function labToDisplay(analyte: string, value: number, sys: LabUnitSystem): number {
  if (sys === "us") return value;
  if (analyte === "hba1c_pct") return round(hba1cPctToMmolMol(value), 0);
  const f = LAB_FACTORS[analyte];
  return f ? round(value / f, 2) : value;
}

/** Display value in the chosen system -> canonical (US) value for storage. */
export function labFromDisplay(analyte: string, value: number, sys: LabUnitSystem): number {
  if (sys === "us") return value;
  if (analyte === "hba1c_pct") return round(hba1cMmolMolToPct(value), 2);
  const f = LAB_FACTORS[analyte];
  return f ? round(value * f, 1) : value;
}

// ---------- display helpers ----------

export function round(n: number, dp = 1): number {
  const m = 10 ** dp;
  return Math.round(n * m) / m;
}

export function formatHeight(cm: number, sys: UnitSystem): string {
  if (sys === "metric") return `${round(cm, 0)} cm`;
  const { ft, inch } = cmToFtIn(cm);
  return `${ft}′ ${round(inch, 0)}″`;
}

export function formatWeight(kg: number, sys: UnitSystem): string {
  return sys === "metric" ? `${round(kg, 1)} kg` : `${round(kgToLb(kg), 1)} lb`;
}

export function formatLength(cm: number, sys: UnitSystem): string {
  return sys === "metric" ? `${round(cm, 1)} cm` : `${round(cmToIn(cm), 1)} in`;
}

export const weightUnit = (s: UnitSystem) => (s === "metric" ? "kg" : "lb");
export const lengthUnit = (s: UnitSystem) => (s === "metric" ? "cm" : "in");
