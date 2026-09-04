import type { Analyte } from "../schema/index.ts";

/**
 * Every calculator returns one of these. The key design rule:
 * a calculator may NEVER guess. If it lacks a validated input it returns
 * `partial` or `not_applicable` and names exactly what is missing.
 *
 * This is what keeps the LLM honest — it can only quote numbers that
 * came out of here.
 */
export type RiskOutcome =
  | {
      status: "ok";
      /** Headline number, e.g. 0.17 for 17% */
      value: number;
      /** How to read `value` */
      unit: "probability_10yr" | "score" | "category";
      band: RiskBand;
      label: string;
      /** Plain-language one-liner. */
      summary: string;
      /** Every input actually used, for auditability. */
      inputsUsed: Record<string, string | number | boolean>;
      /** Ranked, concrete things that would move this number. */
      modifiers: Modifier[];
    }
  | {
      status: "partial";
      /** What we CAN say without the missing inputs. */
      summary: string;
      missing: MissingInput[];
      /** Partial signal derived from available inputs, if any. */
      provisional?: { label: string; band: RiskBand; detail: string };
      modifiers: Modifier[];
    }
  | {
      status: "not_applicable";
      reason: string;
    };

export type RiskBand = "low" | "slightly_elevated" | "moderate" | "high" | "very_high";

export const BAND_LABEL: Record<RiskBand, string> = {
  low: "Low",
  slightly_elevated: "Slightly elevated",
  moderate: "Moderate",
  high: "High",
  very_high: "Very high",
};

export type MissingInput = {
  /** A lab we need, if applicable — lets the UI build a "ask your doctor for these" list. */
  analyte?: Analyte;
  label: string;
  why: string;
};

export type Modifier = {
  text: string;
  /** Roughly how much leverage this has. */
  impact: "high" | "medium" | "low";
  /** Can the user actually change it? */
  modifiable: boolean;
};

export type RiskModel = {
  id: string;
  name: string;
  /** What the number means, in one line. */
  question: string;
  citation: string;
};
