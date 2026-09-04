import {
  CANCERS,
  CARDIOVASCULAR,
  CONDITION_LABELS,
  DIABETES,
  HBOC_SPECTRUM,
  LYNCH_SPECTRUM,
  RELATION_LABELS,
  degreeOf,
  maternalOrPaternal,
  relationSex,
  type Condition,
  type Profile,
} from "../schema/index.ts";

/**
 * Family-history pattern detection.
 *
 * This is deliberately rule-based rather than model-generated. Referral criteria
 * for genetic counselling are published, discrete, and consequential — an LLM
 * paraphrasing them from memory will drift. These rules are the reason the app
 * can say "go get evaluated" with a straight face.
 */

export type Flag = {
  id: string;
  severity: "info" | "notable" | "action";
  title: string;
  detail: string;
  /** What the user should actually do. */
  action?: string;
  citation?: string;
};

export function familyFlags(p: Profile): Flag[] {
  const flags: Flag[] = [];

  type Occurrence = {
    condition: Condition;
    age: number | null;
    relation: string;
    degree: 1 | 2 | 3;
    side: "maternal" | "paternal" | null;
    sex: ReturnType<typeof relationSex>;
  };

  const occ: Occurrence[] = [];
  for (const m of p.family) {
    for (const c of m.conditions) {
      occ.push({
        condition: c.condition,
        age: c.ageAtDiagnosis,
        relation: RELATION_LABELS[m.relation],
        degree: degreeOf(m.relation),
        side: maternalOrPaternal(m.relation),
        sex: relationSex(m.relation),
      });
    }
  }

  // ---------- Cancer: any early diagnosis ----------
  const earlyCancers = occ.filter(
    (o) => CANCERS.includes(o.condition) && o.age != null && o.age < 50,
  );
  for (const e of earlyCancers) {
    flags.push({
      id: `early-cancer-${e.condition}-${e.relation}`,
      severity: e.degree === 1 ? "action" : "notable",
      title: `${CONDITION_LABELS[e.condition]} diagnosed at ${e.age} in your ${e.relation.toLowerCase()}`,
      detail: `Cancer diagnosed before 50 in a ${e.degree === 1 ? "first" : e.degree === 2 ? "second" : "third"}-degree relative is one of the standard triggers for genetic risk evaluation. Early onset raises the likelihood of an inherited predisposition rather than sporadic disease.`,
      action:
        e.degree === 1
          ? "Worth raising with your doctor and asking specifically about referral to genetic counselling."
          : "Worth mentioning to your doctor, especially if other relatives on the same side are affected.",
      citation: "NCCN Genetic/Familial High-Risk Assessment guidelines",
    });
  }

  // ---------- Cancer: same cancer in 2+ relatives ----------
  const byCancer = new Map<Condition, Occurrence[]>();
  for (const o of occ) {
    if (!CANCERS.includes(o.condition)) continue;
    byCancer.set(o.condition, [...(byCancer.get(o.condition) ?? []), o]);
  }
  for (const [cond, list] of byCancer) {
    if (list.length >= 2) {
      const firstDegreeCount = list.filter((l) => l.degree === 1).length;
      flags.push({
        id: `cluster-${cond}`,
        severity: firstDegreeCount >= 2 ? "action" : "notable",
        title: `${CONDITION_LABELS[cond]} in ${list.length} relatives`,
        detail: `Affected: ${list.map((l) => `${l.relation.toLowerCase()}${l.age != null ? ` (age ${l.age})` : ""}`).join(", ")}. Multiple relatives with the same cancer suggests a shared inherited factor, shared environment, or both.`,
        action:
          "This pattern generally meets criteria for a genetics referral. Ask your doctor.",
        citation: "NCCN Genetic/Familial High-Risk Assessment guidelines",
      });
    }
  }

  // ---------- Lynch syndrome: Amsterdam II ----------
  const lynchOcc = occ.filter((o) => LYNCH_SPECTRUM.includes(o.condition));
  const lynchUnder50 = lynchOcc.some((o) => o.age != null && o.age < 50);
  const lynchFirstDegree = lynchOcc.some((o) => o.degree === 1);
  if (lynchOcc.length >= 3 && lynchUnder50 && lynchFirstDegree) {
    flags.push({
      id: "lynch-amsterdam",
      severity: "action",
      title: "Family pattern consistent with Lynch syndrome criteria",
      detail: `You have ${lynchOcc.length} relatives with Lynch-spectrum cancers (colorectal, endometrial, gastric, kidney, pancreatic), at least one first-degree, and at least one diagnosed under 50. This approximates the Amsterdam II criteria.`,
      action:
        "This is a genuine referral indication. Bring it to your doctor and ask about genetic counselling and earlier colonoscopy screening. Lynch syndrome changes screening age substantially.",
      citation: "Vasen HF et al. Amsterdam II criteria. Gastroenterology 1999;116:1453-6.",
    });
  } else if (lynchOcc.length >= 2) {
    flags.push({
      id: "lynch-partial",
      severity: "notable",
      title: "Some clustering of Lynch-spectrum cancers",
      detail: `${lynchOcc.length} relatives with cancers in the Lynch spectrum. This does not meet formal criteria but is worth tracking, especially if you learn of more affected relatives.`,
      action: "Fill in ages of diagnosis where you can — that's what determines whether this crosses a threshold.",
    });
  }

  // ---------- Hereditary breast/ovarian ----------
  const hboc = occ.filter((o) => HBOC_SPECTRUM.includes(o.condition));
  const ovarian = occ.filter((o) => o.condition === "ovarian_cancer");
  const maleBreast = occ.filter((o) => o.condition === "breast_cancer" && o.sex === "male");
  if (ovarian.length > 0) {
    flags.push({
      id: "hboc-ovarian",
      severity: "action",
      title: "Ovarian cancer in the family",
      detail:
        "Ovarian cancer at any age in a close relative is on its own a recognised trigger for BRCA1/2 evaluation, independent of other family history.",
      action: "Mention this specifically to your doctor.",
      citation: "NCCN / USPSTF BRCA referral criteria",
    });
  }
  if (maleBreast.length > 0) {
    flags.push({
      id: "hboc-male-breast",
      severity: "action",
      title: "Male breast cancer in the family",
      detail:
        "Breast cancer in a male relative is strongly associated with BRCA2 and is an independent referral criterion.",
      action: "Raise with your doctor and ask about genetic counselling.",
      citation: "NCCN / USPSTF BRCA referral criteria",
    });
  }
  if (hboc.length >= 3) {
    const sides = new Set(hboc.map((h) => h.side).filter(Boolean));
    if (sides.size === 1) {
      flags.push({
        id: "hboc-same-side",
        severity: "action",
        title: "Breast/ovarian/pancreatic/prostate cluster on one side of the family",
        detail: `${hboc.length} relatives on your ${[...sides][0]} side. Clustering on a single side is more suggestive of an inherited variant than the same count spread across both sides.`,
        action: "Worth a genetics referral conversation.",
      });
    }
  }

  // ---------- Premature cardiovascular disease ----------
  for (const o of occ) {
    if (!CARDIOVASCULAR.includes(o.condition)) continue;
    if (o.degree !== 1 || o.age == null) continue;
    const cut = o.sex === "female" ? 65 : 55;
    if (o.age < cut) {
      flags.push({
        id: `premature-cvd-${o.relation}`,
        severity: "action",
        title: `Premature heart disease in your ${o.relation.toLowerCase()} (age ${o.age})`,
        detail: `${CONDITION_LABELS[o.condition]} before ${cut} in a first-degree ${o.sex === "female" ? "female" : "male"} relative is a formal ACC/AHA risk enhancer. It means your calculated 10-year risk understates your true risk.`,
        action:
          "This is a strong argument for getting a lipid panel including ApoB and Lp(a) earlier than standard guidelines suggest. Lp(a) is genetic, measured once in a lifetime, and commonly missed.",
        citation: "2018 ACC/AHA Cholesterol Guideline, risk-enhancing factors",
      });
    }
  }

  // ---------- Diabetes ----------
  const diabetic = occ.filter((o) => DIABETES.includes(o.condition));
  const diabeticFirstDegree = diabetic.filter((o) => o.degree === 1);
  if (diabeticFirstDegree.length >= 2) {
    flags.push({
      id: "diabetes-both-parents",
      severity: "action",
      title: `Type 2 diabetes in ${diabeticFirstDegree.length} first-degree relatives`,
      detail:
        "Two or more first-degree relatives with type 2 diabetes puts lifetime risk substantially above the population baseline — considerably higher than the 10-year FINDRISC figure alone conveys.",
      action:
        "Annual HbA1c is reasonable even if you feel fine, and earlier than standard screening age. Catching prediabetes is the whole game here — it is reversible.",
    });
  } else if (diabeticFirstDegree.length === 1) {
    const rel = diabeticFirstDegree[0];
    flags.push({
      id: "diabetes-one-parent",
      severity: "notable",
      title: `Type 2 diabetes in your ${rel.relation.toLowerCase()}${rel.age != null ? ` (diagnosed at ${rel.age})` : ""}`,
      detail:
        rel.age != null && rel.age < 50
          ? "Diagnosis before 50 in a parent suggests a stronger genetic component and points to earlier screening for you."
          : "A first-degree relative with type 2 diabetes roughly doubles to triples your own risk.",
      action: "Ask for an HbA1c at your next blood draw.",
    });
  }

  // ---------- Early death ----------
  for (const m of p.family) {
    if (m.alive === false && m.ageNowOrAtDeath != null && m.ageNowOrAtDeath < 60 && degreeOf(m.relation) === 1) {
      flags.push({
        id: `early-death-${m.id}`,
        severity: "notable",
        title: `Your ${RELATION_LABELS[m.relation].toLowerCase()} died at ${m.ageNowOrAtDeath}`,
        detail:
          "Death before 60 in a first-degree relative is worth understanding precisely. The cause matters a great deal for your own screening plan.",
        action: m.causeOfDeath
          ? undefined
          : "If you can find out the cause, add it — it materially changes what I can tell you.",
      });
    }
  }

  const rank = { action: 0, notable: 1, info: 2 };
  return flags.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
