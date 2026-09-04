import {
  ANALYTE_META,
  CONDITION_LABELS,
  ETHNICITY_LABELS,
  RELATION_LABELS,
  ageFrom,
  degreeOf,
  type MemoryFact,
  type Profile,
} from "../schema/index.ts";
import { BAND_LABEL, type RiskSnapshot } from "../risk/index.ts";

/**
 * Generates the human-readable markdown "context docs".
 *
 * These serve two purposes at once: they are what gets loaded into the model's
 * context each turn, and they are readable by you directly. If the coach ever
 * says something odd, you can open these and see exactly what it was told.
 */

export function profileDoc(p: Profile): string {
  const age = ageFrom(p.birthYear);
  const a = p.anthropometrics;
  const L: string[] = [];

  L.push("# Profile");
  L.push("");
  if (p.name) L.push(`Name: ${p.name}`);
  L.push(`Age: ${age}`);
  L.push(`Sex at birth: ${p.sexAtBirth}`);
  L.push(`Ethnicity: ${p.ethnicity.map((e) => ETHNICITY_LABELS[e]).join(", ") || "not specified"}`);
  L.push(`Height: ${a.heightCm} cm`);
  L.push(`Weight: ${a.weightKg} kg`);
  if (a.waistCm != null) L.push(`Waist: ${a.waistCm} cm`);
  else L.push("Waist: not recorded (this is a high-value missing input)");

  L.push("");
  L.push("## Vitals");
  L.push(
    p.vitals.systolic != null && p.vitals.diastolic != null
      ? `Blood pressure: ${p.vitals.systolic}/${p.vitals.diastolic} mmHg`
      : "Blood pressure: not recorded",
  );
  if (p.vitals.restingHeartRate != null)
    L.push(`Resting heart rate: ${p.vitals.restingHeartRate} bpm`);
  L.push(`On blood pressure medication: ${p.vitals.onBloodPressureMeds ? "yes" : "no"}`);

  L.push("");
  L.push("## Lifestyle");
  L.push(`Smoking: ${p.lifestyle.smoking}`);
  L.push(`Activity: ${p.lifestyle.activityMinutesPerWeek} min/week of moderate+ exercise`);
  L.push(`Alcohol: ${p.lifestyle.alcoholPerWeek} standard drinks/week`);
  L.push(`Eats vegetables/fruit daily: ${p.lifestyle.eatsVegetablesDaily ? "yes" : "no"}`);
  L.push(`Average sleep: ${p.lifestyle.averageSleepHours} hours`);

  L.push("");
  L.push("## My conditions");
  if (!p.ownConditions.length) L.push("None recorded.");
  for (const c of p.ownConditions)
    L.push(
      `- ${CONDITION_LABELS[c.condition]}${c.diagnosedAge != null ? ` (diagnosed age ${c.diagnosedAge})` : ""}`,
    );

  L.push("");
  L.push("## Medications");
  if (!p.medications.length) L.push("None recorded.");
  for (const m of p.medications) L.push(`- ${m.name}${m.note ? ` — ${m.note}` : ""}`);

  L.push("");
  L.push("## Allergies");
  L.push(p.allergies.length ? p.allergies.map((x) => `- ${x}`).join("\n") : "None recorded.");

  L.push("");
  L.push("## Labs");
  if (!p.labs.length) {
    L.push("No lab results recorded yet.");
  } else {
    const latest = new Map<string, (typeof p.labs)[number]>();
    for (const l of [...p.labs].sort((x, y) => x.takenAt.localeCompare(y.takenAt)))
      latest.set(l.analyte, l);
    for (const [, l] of latest) {
      const meta = ANALYTE_META[l.analyte];
      const range = meta.optimal ? ` (optimal ${meta.optimal[0]}–${meta.optimal[1]})` : "";
      L.push(`- ${meta.label}: ${l.value} ${meta.unit}${range} — taken ${l.takenAt}`);
    }
  }

  return L.join("\n");
}

export function familyHistoryDoc(p: Profile): string {
  const L: string[] = ["# Family history", ""];
  if (!p.family.length) {
    L.push("No family history recorded.");
    return L.join("\n");
  }

  const byDegree = [1, 2, 3] as const;
  for (const d of byDegree) {
    const members = p.family.filter((m) => degreeOf(m.relation) === d);
    if (!members.length) continue;
    L.push(`## ${d === 1 ? "First" : d === 2 ? "Second" : "Third"}-degree relatives`);
    for (const m of members) {
      const status =
        m.alive === false
          ? `died${m.ageNowOrAtDeath != null ? ` at ${m.ageNowOrAtDeath}` : ""}${m.causeOfDeath ? ` — ${CONDITION_LABELS[m.causeOfDeath]}` : ""}`
          : m.ageNowOrAtDeath != null
            ? `age ${m.ageNowOrAtDeath}`
            : "";
      L.push(`### ${RELATION_LABELS[m.relation]}${status ? ` (${status})` : ""}`);
      if (!m.conditions.length) L.push("- No conditions recorded");
      for (const c of m.conditions)
        L.push(
          `- ${CONDITION_LABELS[c.condition]}${c.ageAtDiagnosis != null ? ` — diagnosed at ${c.ageAtDiagnosis}` : " — age at diagnosis unknown"}${c.note ? ` (${c.note})` : ""}`,
        );
    }
    L.push("");
  }
  return L.join("\n");
}

export function riskDoc(s: RiskSnapshot): string {
  const L: string[] = ["# Risk assessment", ""];
  L.push(`Computed: ${s.computedAt}`);
  L.push("");
  L.push(
    "> These numbers come from deterministic, published calculators — not from a language model. Quote them exactly; never estimate a risk figure that is not listed here.",
  );
  L.push("");

  L.push(`## Body composition`);
  L.push(
    `BMI ${s.bmi.bmi.toFixed(1)} — ${s.bmi.category}. Thresholds used: overweight ≥${s.bmi.thresholds.overweight}, obese ≥${s.bmi.thresholds.obese}. ${s.bmi.thresholds.rationale}`,
  );
  L.push("");

  for (const { model, outcome } of s.risks) {
    L.push(`## ${model.name}`);
    L.push(`_${model.question}_`);
    L.push("");
    if (outcome.status === "ok") {
      L.push(`**Result: ${outcome.label} — ${BAND_LABEL[outcome.band]}**`);
      L.push("");
      L.push(outcome.summary);
      L.push("");
      L.push("Inputs used:");
      for (const [k, v] of Object.entries(outcome.inputsUsed)) L.push(`- ${k}: ${v}`);
      if (outcome.modifiers.length) {
        L.push("");
        L.push("What moves this:");
        for (const m of outcome.modifiers)
          L.push(`- [${m.impact}${m.modifiable ? "" : ", not modifiable"}] ${m.text}`);
      }
    } else if (outcome.status === "partial") {
      L.push(`**Result: cannot compute yet**`);
      L.push("");
      L.push(outcome.summary);
      L.push("");
      L.push("Missing inputs:");
      for (const m of outcome.missing) L.push(`- ${m.label} — ${m.why}`);
      if (outcome.provisional) {
        L.push("");
        L.push(`${outcome.provisional.label}: ${outcome.provisional.detail}`);
      }
    } else {
      L.push(`**Not applicable.** ${outcome.reason}`);
    }
    L.push("");
    L.push(`Source: ${model.citation}`);
    L.push("");
  }

  if (s.metrics.length) {
    L.push("## Other measures");
    for (const m of s.metrics) {
      L.push(`- **${m.label}: ${m.value}** (${BAND_LABEL[m.band]}) — ${m.detail}`);
      if (m.citation) L.push(`  Source: ${m.citation}`);
    }
    L.push("");
  }

  if (s.flags.length) {
    L.push("## Family history flags");
    for (const f of s.flags) {
      L.push(`### [${f.severity}] ${f.title}`);
      L.push(f.detail);
      if (f.action) L.push(`Action: ${f.action}`);
      if (f.citation) L.push(`Source: ${f.citation}`);
      L.push("");
    }
  }

  if (s.missing.length) {
    L.push("## Tests worth asking a doctor for");
    for (const m of s.missing) L.push(`- ${m.label} — ${m.why}`);
  }

  return L.join("\n");
}

export function memoryDoc(facts: MemoryFact[]): string {
  const approved = facts.filter((f) => f.approved);
  const L: string[] = ["# What I know about you", ""];
  if (!approved.length) {
    L.push("Nothing recorded yet.");
    return L.join("\n");
  }
  const cats = ["preference", "constraint", "goal", "history", "context"] as const;
  for (const c of cats) {
    const rows = approved.filter((f) => f.category === c);
    if (!rows.length) continue;
    L.push(`## ${c[0].toUpperCase()}${c.slice(1)}`);
    for (const r of rows) L.push(`- ${r.text}`);
    L.push("");
  }
  return L.join("\n");
}
