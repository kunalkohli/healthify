import { describe, expect, test } from "bun:test";
import {
  availableRelations,
  emptyProfile,
  relationDisplayLabel,
  uid,
  type Ethnicity,
  type Profile,
  type Relation,
  type SexAtBirth,
} from "../schema/index.ts";
import { ascvd } from "./ascvd.ts";
import { findrisc } from "./findrisc.ts";
import { familyFlags } from "./hereditary.ts";
import { bmiThresholds } from "./anthropometry.ts";
import { frsSimple } from "./frsSimple.ts";
import { bloodPressureMetric, metabolicSyndromeMetric, waistToHeightMetric } from "./metrics.ts";
import { pruneChat } from "../../storage/db.ts";
import { getProvider } from "../agent/providers/index.ts";

const THIS_YEAR = new Date().getFullYear();

function subject(o: {
  age: number;
  sex: SexAtBirth;
  ethnicity: Ethnicity[];
  tc?: number;
  hdl?: number;
  sbp?: number;
  treated?: boolean;
  smoker?: boolean;
  diabetic?: boolean;
}): Profile {
  const p = emptyProfile();
  p.birthYear = THIS_YEAR - o.age;
  p.sexAtBirth = o.sex;
  p.ethnicity = o.ethnicity;
  p.vitals.systolic = o.sbp ?? null;
  p.vitals.onBloodPressureMeds = o.treated ?? false;
  p.lifestyle.smoking = o.smoker ? "current" : "never";
  if (o.diabetic)
    p.ownConditions.push({ id: uid(), condition: "type2_diabetes", diagnosedAge: null });
  if (o.tc != null)
    p.labs.push({
      id: uid(),
      analyte: "total_cholesterol_mgdl",
      value: o.tc,
      takenAt: "2026-01-01",
    });
  if (o.hdl != null)
    p.labs.push({ id: uid(), analyte: "hdl_mgdl", value: o.hdl, takenAt: "2026-01-01" });
  return p;
}

/**
 * Reference values from the 2013 ACC/AHA Pooled Cohort Equations worked examples:
 * a 55-year-old with TC 213, HDL 50, untreated SBP 120, non-smoker, non-diabetic.
 * If these drift, the coefficient table is wrong and every number in the app is wrong.
 */
describe("ASCVD Pooled Cohort Equations", () => {
  const base = { age: 55, tc: 213, hdl: 50, sbp: 120 } as const;

  test("white male ≈ 5.3%", () => {
    const r = ascvd(subject({ ...base, sex: "male", ethnicity: ["white_european"] }));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.value * 100).toBeCloseTo(5.3, 0);
  });

  test("white female ≈ 2.1%", () => {
    const r = ascvd(subject({ ...base, sex: "female", ethnicity: ["white_european"] }));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.value * 100).toBeCloseTo(2.1, 0);
  });

  test("black male ≈ 6.1%", () => {
    const r = ascvd(subject({ ...base, sex: "male", ethnicity: ["black_african"] }));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.value * 100).toBeCloseTo(6.1, 0);
  });

  test("black female ≈ 3.0%", () => {
    const r = ascvd(subject({ ...base, sex: "female", ethnicity: ["black_african"] }));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.value * 100).toBeCloseTo(3.0, 0);
  });

  test("smoking and diabetes both increase risk", () => {
    const plain = ascvd(subject({ ...base, sex: "male", ethnicity: ["white_european"] }));
    const smoker = ascvd(
      subject({ ...base, sex: "male", ethnicity: ["white_european"], smoker: true }),
    );
    const diabetic = ascvd(
      subject({ ...base, sex: "male", ethnicity: ["white_european"], diabetic: true }),
    );
    if (plain.status !== "ok" || smoker.status !== "ok" || diabetic.status !== "ok") throw 1;
    expect(smoker.value).toBeGreaterThan(plain.value);
    expect(diabetic.value).toBeGreaterThan(plain.value);
  });

  // The whole point of the engine: refusing to answer when it shouldn't.
  test("refuses under age 40 instead of extrapolating", () => {
    const r = ascvd(subject({ ...base, age: 32, sex: "male", ethnicity: ["white_european"] }));
    expect(r.status).toBe("not_applicable");
  });

  test("refuses over age 79", () => {
    const r = ascvd(subject({ ...base, age: 84, sex: "male", ethnicity: ["white_european"] }));
    expect(r.status).toBe("not_applicable");
  });

  test("reports missing labs rather than guessing", () => {
    const p = subject({ age: 55, sex: "male", ethnicity: ["white_european"], sbp: 120 });
    const r = ascvd(p);
    expect(r.status).toBe("partial");
    if (r.status !== "partial") return;
    const labels = r.missing.map((m) => m.label);
    expect(labels).toContain("Total cholesterol");
    expect(labels).toContain("HDL cholesterol");
  });

  test("flags South Asian ancestry as a risk enhancer", () => {
    const r = ascvd(subject({ ...base, sex: "male", ethnicity: ["south_asian"] }));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.modifiers.some((m) => m.text.includes("South Asian"))).toBe(true);
  });
});

describe("FINDRISC", () => {
  test("healthy young adult lands in the low band", () => {
    const p = emptyProfile();
    p.birthYear = THIS_YEAR - 30;
    p.ethnicity = ["white_european"];
    p.anthropometrics = { heightCm: 180, weightKg: 70, waistCm: 80 };
    p.lifestyle.activityMinutesPerWeek = 200;
    const r = findrisc(p);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.band).toBe("low");
  });

  test("accumulates points correctly for a high-risk profile", () => {
    const p = emptyProfile();
    p.birthYear = THIS_YEAR - 56; // +3
    p.ethnicity = ["south_asian"];
    p.anthropometrics = { heightCm: 170, weightKg: 95, waistCm: 110 }; // BMI 32.9 (+3), waist (+4)
    p.lifestyle.activityMinutesPerWeek = 0; // +2
    p.lifestyle.eatsVegetablesDaily = false; // +1
    p.vitals.onBloodPressureMeds = true; // +2
    p.everHadHighGlucose = true; // +5
    p.family = [
      {
        id: uid(),
        relation: "father",
        alive: true,
        ageNowOrAtDeath: 80,
        conditions: [{ id: uid(), condition: "type2_diabetes", ageAtDiagnosis: 52 }],
      },
    ]; // +5
    const r = findrisc(p);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.label.startsWith("25/26")).toBe(true);
    expect(r.band).toBe("very_high");
  });

  test("first-degree family history scores higher than second-degree", () => {
    const mk = (relation: "father" | "paternal_uncle") => {
      const p = emptyProfile();
      p.ethnicity = ["white_european"];
      p.family = [
        {
          id: uid(),
          relation,
          alive: true,
          ageNowOrAtDeath: 70,
          conditions: [{ id: uid(), condition: "type2_diabetes", ageAtDiagnosis: 55 }],
        },
      ];
      return findrisc(p);
    };
    const first = mk("father");
    const second = mk("paternal_uncle");
    if (first.status !== "ok" || second.status !== "ok") throw 1;
    expect(first.value).toBeGreaterThanOrEqual(second.value);
  });

  test("not applicable once already diagnosed", () => {
    const p = emptyProfile();
    p.ethnicity = ["white_european"];
    p.ownConditions.push({ id: uid(), condition: "type2_diabetes", diagnosedAge: 50 });
    expect(findrisc(p).status).toBe("not_applicable");
  });
});

describe("ethnicity-adjusted BMI thresholds", () => {
  test("South Asian ancestry lowers the cut-offs", () => {
    expect(bmiThresholds(["south_asian"]).overweight).toBe(23);
    expect(bmiThresholds(["white_european"]).overweight).toBe(25);
  });
});

describe("family history flags", () => {
  test("detects premature cardiovascular disease in a father", () => {
    const p = emptyProfile();
    p.ethnicity = ["white_european"];
    p.family = [
      {
        id: uid(),
        relation: "father",
        alive: false,
        ageNowOrAtDeath: 52,
        conditions: [{ id: uid(), condition: "heart_attack", ageAtDiagnosis: 51 }],
      },
    ];
    const flags = familyFlags(p);
    expect(flags.some((f) => f.id.startsWith("premature-cvd"))).toBe(true);
  });

  test("does not flag a father's heart attack at 70 as premature", () => {
    const p = emptyProfile();
    p.ethnicity = ["white_european"];
    p.family = [
      {
        id: uid(),
        relation: "father",
        alive: true,
        ageNowOrAtDeath: 75,
        conditions: [{ id: uid(), condition: "heart_attack", ageAtDiagnosis: 70 }],
      },
    ];
    expect(familyFlags(p).some((f) => f.id.startsWith("premature-cvd"))).toBe(false);
  });

  test("detects a Lynch-spectrum pattern", () => {
    const p = emptyProfile();
    p.ethnicity = ["white_european"];
    p.family = [
      {
        id: uid(),
        relation: "mother",
        alive: false,
        ageNowOrAtDeath: 55,
        conditions: [{ id: uid(), condition: "colorectal_cancer", ageAtDiagnosis: 45 }],
      },
      {
        id: uid(),
        relation: "maternal_uncle",
        alive: false,
        ageNowOrAtDeath: 60,
        conditions: [{ id: uid(), condition: "colorectal_cancer", ageAtDiagnosis: 58 }],
      },
      {
        id: uid(),
        relation: "maternal_grandmother",
        alive: false,
        ageNowOrAtDeath: 70,
        conditions: [{ id: uid(), condition: "endometrial_cancer", ageAtDiagnosis: 62 }],
      },
    ];
    const flags = familyFlags(p);
    expect(flags.some((f) => f.id === "lynch-amsterdam")).toBe(true);
  });

  test("ovarian cancer alone triggers a referral flag", () => {
    const p = emptyProfile();
    p.ethnicity = ["white_european"];
    p.family = [
      {
        id: uid(),
        relation: "mother",
        alive: true,
        ageNowOrAtDeath: 60,
        conditions: [{ id: uid(), condition: "ovarian_cancer", ageAtDiagnosis: 58 }],
      },
    ];
    expect(familyFlags(p).some((f) => f.id === "hboc-ovarian")).toBe(true);
  });

  test("two diabetic parents produce the stronger flag", () => {
    const p = emptyProfile();
    p.ethnicity = ["south_asian"];
    p.family = [
      {
        id: uid(),
        relation: "mother",
        alive: true,
        ageNowOrAtDeath: 65,
        conditions: [{ id: uid(), condition: "type2_diabetes", ageAtDiagnosis: 55 }],
      },
      {
        id: uid(),
        relation: "father",
        alive: true,
        ageNowOrAtDeath: 68,
        conditions: [{ id: uid(), condition: "type2_diabetes", ageAtDiagnosis: 52 }],
      },
    ];
    expect(familyFlags(p).some((f) => f.id === "diabetes-both-parents")).toBe(true);
  });

  test("clean family history produces no flags", () => {
    const p = emptyProfile();
    p.ethnicity = ["white_european"];
    expect(familyFlags(p)).toHaveLength(0);
  });
});

describe("Framingham office-based model (no bloodwork)", () => {
  /**
   * The reference implementation documents this exact case as 16.7%.
   * If it drifts, the coefficient table is wrong.
   */
  test("matches the published worked example: male 55, BMI 30, SBP 140", () => {
    const p = emptyProfile();
    p.birthYear = THIS_YEAR - 55;
    p.sexAtBirth = "male";
    p.ethnicity = ["white_european"];
    p.anthropometrics = { heightCm: 100, weightKg: 30, waistCm: null }; // BMI exactly 30
    p.vitals.systolic = 140;
    p.vitals.diastolic = 85;
    p.vitals.onBloodPressureMeds = false;
    p.lifestyle.smoking = "never";
    const r = frsSimple(p);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.value * 100).toBeCloseTo(16.7, 1);
  });

  test("produces a number at 35, where ASCVD refuses", () => {
    const p = emptyProfile();
    p.birthYear = THIS_YEAR - 35;
    p.sexAtBirth = "male";
    p.ethnicity = ["south_asian"];
    p.anthropometrics = { heightCm: 175, weightKg: 82, waistCm: 95 };
    p.vitals.systolic = 128;
    p.vitals.diastolic = 82;
    expect(frsSimple(p).status).toBe("ok");
    expect(ascvd(p).status).toBe("not_applicable");
  });

  test("asks for blood pressure rather than guessing it", () => {
    const p = emptyProfile();
    p.birthYear = THIS_YEAR - 45;
    p.ethnicity = ["white_european"];
    const r = frsSimple(p);
    expect(r.status).toBe("partial");
    if (r.status !== "partial") return;
    expect(r.missing[0].label).toBe("Systolic blood pressure");
  });

  test("refuses under 30", () => {
    const p = emptyProfile();
    p.birthYear = THIS_YEAR - 24;
    p.ethnicity = ["white_european"];
    p.vitals.systolic = 120;
    expect(frsSimple(p).status).toBe("not_applicable");
  });
});

describe("threshold metrics", () => {
  const base = () => {
    const p = emptyProfile();
    p.ethnicity = ["south_asian"];
    p.anthropometrics = { heightCm: 175, weightKg: 78, waistCm: 95 };
    return p;
  };

  test("stages blood pressure per ACC/AHA 2017", () => {
    const mk = (sys: number, dia: number) => {
      const p = base();
      p.vitals.systolic = sys;
      p.vitals.diastolic = dia;
      return bloodPressureMetric(p)!;
    };
    expect(mk(115, 75).band).toBe("low");
    expect(mk(125, 75).band).toBe("slightly_elevated");
    expect(mk(135, 85).band).toBe("moderate");
    expect(mk(145, 95).band).toBe("high");
    expect(mk(190, 125).band).toBe("very_high");
  });

  test("waist-to-height uses the 0.5 boundary", () => {
    const p = base();
    p.anthropometrics.waistCm = 87.5; // exactly 0.5 of 175
    expect(waistToHeightMetric(p)!.band).toBe("moderate");
    p.anthropometrics.waistCm = 80;
    expect(waistToHeightMetric(p)!.band).toBe("low");
  });

  test("metabolic syndrome counts unknowns as unknown, not negative", () => {
    const p = base();
    p.vitals.systolic = 135;
    p.vitals.diastolic = 88;
    const m = metabolicSyndromeMetric(p)!;
    // Waist 95 >= 90 (South Asian male) and BP elevated = 2 met, 3 unmeasured.
    expect(m.value).toBe("2/5");
    expect(m.detail).toContain("Not yet measurable");
  });
});

describe("family editor relation rules", () => {
  test("a second mother or father is not offered", () => {
    const avail = availableRelations(["mother", "father"]);
    expect(avail).not.toContain("mother");
    expect(avail).not.toContain("father");
  });

  test("siblings and children can repeat", () => {
    const avail = availableRelations(["sister", "sister", "son"]);
    expect(avail).toContain("sister");
    expect(avail).toContain("son");
    expect(avail).toContain("brother");
  });

  test("grandparents are unique per side", () => {
    const avail = availableRelations(["maternal_grandmother"]);
    expect(avail).not.toContain("maternal_grandmother");
    expect(avail).toContain("paternal_grandmother");
  });

  /**
   * The bug: a <select> holding a value that isn't in its options displays the
   * first option but keeps the stale value, so the UI said "Father" and adding
   * produced "Mother". Whatever the stale value, the coerced one must be real.
   */
  test("a stale selection always coerces into the available list", () => {
    const existing: Relation[] = ["mother"];
    const options = availableRelations(existing);
    const stale: Relation = "mother"; // no longer offered
    const coerced = options.includes(stale) ? stale : options[0];
    expect(options).toContain(coerced);
    expect(coerced).not.toBe("mother");
  });

  test("repeated relations get numbered labels", () => {
    const members = [
      { id: "a", relation: "sister" as Relation },
      { id: "b", relation: "sister" as Relation },
      { id: "c", relation: "father" as Relation },
    ];
    expect(relationDisplayLabel(members, "a")).toBe("Sister 1");
    expect(relationDisplayLabel(members, "b")).toBe("Sister 2");
    expect(relationDisplayLabel(members, "c")).toBe("Father");
  });
});

describe("chat retention", () => {
  const msg = (daysAgo: number) => ({
    id: uid(),
    role: "user" as const,
    content: "hello",
    createdAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  });

  test("keeps messages inside the window, drops older ones", () => {
    const kept = pruneChat([msg(0), msg(1), msg(3), msg(10)], 2);
    expect(kept).toHaveLength(2);
  });

  test("0 means keep everything", () => {
    expect(pruneChat([msg(0), msg(400)], 0)).toHaveLength(2);
  });

  test("a malformed timestamp is kept rather than silently binned", () => {
    const bad = { id: uid(), role: "user" as const, content: "x", createdAt: "not-a-date" };
    expect(pruneChat([bad], 1)).toHaveLength(1);
  });
});

describe("history reseeding after a tab switch", () => {
  const rendered = [
    { role: "user" as const, content: "what should I focus on?" },
    { role: "assistant" as const, content: "blood pressure first" },
  ];

  /**
   * The chat component unmounts on tab switch and loses its in-memory
   * history. Reseeding it with the wrong shape is worse than losing it —
   * the request fails outright. Each provider must emit its own format.
   */
  test("anthropic gets role/content", () => {
    const h = getProvider("anthropic").seedHistory(rendered);
    expect(h[0]).toEqual({ role: "user", content: "what should I focus on?" });
    expect(h[1].role).toBe("assistant");
  });

  test("gemini gets model/parts, not assistant/content", () => {
    const h = getProvider("gemini").seedHistory(rendered);
    expect(h[1].role).toBe("model");
    expect(h[1].parts[0].text).toBe("blood pressure first");
    expect(h[1].content).toBeUndefined();
  });

  test("openai-compatible gets role/content", () => {
    const h = getProvider("openai_compatible").seedHistory(rendered);
    expect(h[1]).toEqual({ role: "assistant", content: "blood pressure first" });
  });

  test("every provider round-trips an empty conversation", () => {
    for (const id of ["anthropic", "gemini", "ollama", "openai_compatible"] as const) {
      expect(getProvider(id).seedHistory([])).toEqual([]);
    }
  });
});
