import {
  ANALYTE_META,
  CONDITION_LABELS,
  type Analyte,
  type JournalEntry,
  type MemoryFact,
  type Profile,
} from "../schema/index.ts";
import { BAND_LABEL, computeOne, snapshot } from "../risk/index.ts";
import { familyHistoryDoc, profileDoc } from "../context/generate.ts";

export type ToolDef = {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
};

export const TOOLS: ToolDef[] = [
  {
    name: "get_profile",
    description:
      "The person's current profile: demographics, anthropometrics, vitals, lifestyle, conditions, medications, allergies, and latest labs.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_family_history",
    description: "Full family history, grouped by degree of relation, with ages at diagnosis.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "compute_risk",
    description:
      "Run a validated risk calculator and return the deterministic result. This is the ONLY legitimate source of a risk number. Returns status ok / partial / not_applicable.",
    input_schema: {
      type: "object",
      properties: {
        model: {
          type: "string",
          enum: ["findrisc", "frs_simple", "ascvd"],
          description:
            "findrisc = 10-year type 2 diabetes risk (no labs). frs_simple = 10-year cardiovascular risk using BMI instead of a lipid panel (no labs, ages 30-74). ascvd = 10-year heart attack/stroke risk (needs lipids + BP, ages 40-79).",
        },
      },
      required: ["model"],
    },
  },
  {
    name: "get_risk_summary",
    description:
      "All computed risks, family-history flags, BMI assessment, and the list of missing inputs, in one call.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_labs",
    description: "Lab results, optionally filtered to one analyte, newest first.",
    input_schema: {
      type: "object",
      properties: {
        analyte: { type: "string", description: "Optional analyte key, e.g. hba1c_pct, ldl_mgdl." },
      },
    },
  },
  {
    name: "search_history",
    description:
      "Keyword search across the person's journal entries (meals, weight, symptoms, notes).",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "remember",
    description:
      "Record a durable fact about the person (a preference, constraint, or goal) for future conversations. Use sparingly and only for things that will still matter in months. The fact is queued for the person's approval before it takes effect.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string" },
        category: {
          type: "string",
          enum: ["preference", "constraint", "goal", "history", "context"],
        },
      },
      required: ["text", "category"],
    },
  },
  {
    name: "log_entry",
    description: "Log something to the person's journal on their behalf when they tell you about it.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["meal", "weight", "symptom", "note", "activity"] },
        text: { type: "string" },
        value: { type: "number", description: "Optional numeric value, e.g. weight in kg." },
      },
      required: ["kind", "text"],
    },
  },
];

export type ToolContext = {
  profile: Profile;
  journal: JournalEntry[];
  addMemory: (text: string, category: MemoryFact["category"]) => void;
  addJournal: (e: Omit<JournalEntry, "id" | "createdAt">) => void;
};

export function runTool(name: string, input: Record<string, any>, ctx: ToolContext): string {
  const p = ctx.profile;

  switch (name) {
    case "get_profile":
      return profileDoc(p);

    case "get_family_history":
      return familyHistoryDoc(p);

    case "compute_risk": {
      const r = computeOne(p, input.model);
      if (!r) return `Unknown model "${input.model}".`;
      const { model, outcome } = r;
      if (outcome.status === "not_applicable")
        return `${model.name}: NOT APPLICABLE.\n${outcome.reason}\n\nDo not substitute an estimate. Explain this to the person directly.`;
      if (outcome.status === "partial")
        return [
          `${model.name}: CANNOT COMPUTE YET.`,
          outcome.summary,
          "",
          "Missing:",
          ...outcome.missing.map((m) => `- ${m.label}: ${m.why}`),
          outcome.provisional
            ? `\n${outcome.provisional.label}: ${outcome.provisional.detail}`
            : "",
          "",
          "Do not estimate a number. Tell them what to get.",
        ].join("\n");
      return [
        `${model.name}: ${outcome.label} (${BAND_LABEL[outcome.band]})`,
        outcome.summary,
        "",
        "Inputs used:",
        ...Object.entries(outcome.inputsUsed).map(([k, v]) => `- ${k}: ${v}`),
        "",
        "Levers:",
        ...outcome.modifiers.map(
          (m) => `- [${m.impact}${m.modifiable ? "" : ", fixed"}] ${m.text}`,
        ),
        "",
        `Source: ${model.citation}`,
      ].join("\n");
    }

    case "get_risk_summary": {
      const s = snapshot(p);
      const L: string[] = [];
      L.push(`BMI ${s.bmi.bmi.toFixed(1)} (${s.bmi.category}). ${s.bmi.thresholds.rationale}`);
      L.push("");
      for (const { model, outcome } of s.risks) {
        if (outcome.status === "ok")
          L.push(`${model.name}: ${outcome.label} — ${BAND_LABEL[outcome.band]}`);
        else if (outcome.status === "partial")
          L.push(
            `${model.name}: cannot compute — missing ${outcome.missing.map((m) => m.label).join(", ")}`,
          );
        else L.push(`${model.name}: not applicable — ${outcome.reason}`);
      }
      if (s.metrics.length) {
        L.push("");
        L.push("Other measures:");
        for (const m of s.metrics) L.push(`- ${m.label}: ${m.value} (${m.band}) — ${m.detail}`);
      }
      if (s.flags.length) {
        L.push("");
        L.push("Family history flags:");
        for (const f of s.flags) L.push(`- [${f.severity}] ${f.title}: ${f.detail}`);
      }
      if (s.missing.length) {
        L.push("");
        L.push("Missing inputs worth getting:");
        for (const m of s.missing) L.push(`- ${m.label}: ${m.why}`);
      }
      return L.join("\n");
    }

    case "get_labs": {
      const rows = (input.analyte ? p.labs.filter((l) => l.analyte === input.analyte) : p.labs)
        .slice()
        .sort((a, b) => b.takenAt.localeCompare(a.takenAt));
      if (!rows.length) return "No lab results recorded.";
      return rows
        .map((l) => {
          const m = ANALYTE_META[l.analyte as Analyte];
          return `${l.takenAt} — ${m.label}: ${l.value} ${m.unit}${m.optimal ? ` (optimal ${m.optimal[0]}–${m.optimal[1]})` : ""}`;
        })
        .join("\n");
    }

    case "search_history": {
      const q = String(input.query ?? "").toLowerCase();
      const hits = ctx.journal.filter((j) => j.text.toLowerCase().includes(q));
      if (!hits.length) return `No journal entries matching "${input.query}".`;
      return hits
        .slice(-40)
        .map((j) => `${j.date} [${j.kind}] ${j.text}${j.value != null ? ` (${j.value})` : ""}`)
        .join("\n");
    }

    case "remember":
      ctx.addMemory(input.text, input.category);
      return `Queued for their approval: "${input.text}". Mention briefly that you've noted it; it won't apply until they confirm.`;

    case "log_entry":
      ctx.addJournal({
        kind: input.kind,
        text: input.text,
        value: input.value ?? null,
        date: new Date().toISOString().slice(0, 10),
      });
      return `Logged: [${input.kind}] ${input.text}`;

    default:
      return `Unknown tool "${name}".`;
  }
}

/** Used by the "what tests should I get" screen. */
export function conditionLabel(c: keyof typeof CONDITION_LABELS): string {
  return CONDITION_LABELS[c];
}
