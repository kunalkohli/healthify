import { useState } from "react";
import {
  CONDITION_LABELS,
  RELATION_LABELS,
  Relation,
  Condition,
  degreeOf,
  uid,
  type FamilyMember,
} from "../core/schema/index.ts";
import { Button, Card, Field, NumberInput, Select } from "./primitives.tsx";

const RELATION_OPTIONS = Relation.options.map((r) => ({ value: r, label: RELATION_LABELS[r] }));

/** Ordered so the conditions that actually drive the risk rules appear first. */
const COMMON_CONDITIONS: Condition[] = [
  "type2_diabetes",
  "heart_attack",
  "stroke",
  "hypertension",
  "high_cholesterol",
  "colorectal_cancer",
  "breast_cancer",
  "prostate_cancer",
  "ovarian_cancer",
  "lung_cancer",
  "pancreatic_cancer",
  "endometrial_cancer",
  "gastric_cancer",
  "kidney_cancer",
  "melanoma",
  "other_cancer",
  "alzheimers",
  "parkinsons",
  "kidney_disease",
  "liver_disease",
  "thyroid_disease",
  "osteoporosis",
  "rheumatoid_arthritis",
  "depression",
  "other",
];

const CONDITION_OPTIONS = COMMON_CONDITIONS.map((c) => ({
  value: c,
  label: CONDITION_LABELS[c],
}));

export function FamilyEditor({
  family,
  onChange,
}: {
  family: FamilyMember[];
  onChange: (f: FamilyMember[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [relation, setRelation] = useState<Relation>("mother");

  const used = new Set(family.map((f) => f.relation));

  function addMember() {
    onChange([
      ...family,
      {
        id: uid(),
        relation,
        alive: true,
        ageNowOrAtDeath: null,
        causeOfDeath: null,
        conditions: [],
      },
    ]);
    setAdding(false);
  }

  function update(id: string, patch: Partial<FamilyMember>) {
    onChange(family.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  function remove(id: string) {
    onChange(family.filter((m) => m.id !== id));
  }

  const sorted = [...family].sort((a, b) => degreeOf(a.relation) - degreeOf(b.relation));

  return (
    <div>
      {sorted.map((m) => (
        <MemberCard
          key={m.id}
          member={m}
          onUpdate={(p) => update(m.id, p)}
          onRemove={() => remove(m.id)}
        />
      ))}

      {adding ? (
        <Card>
          <Field label="Who is this?">
            <Select
              value={relation}
              onChange={setRelation}
              options={RELATION_OPTIONS.filter(
                (o) => !used.has(o.value) || o.value === "cousin" || o.value.includes("aunt") || o.value.includes("uncle"),
              )}
            />
          </Field>
          <div className="flex gap-2">
            <Button onClick={addMember}>Add</Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : (
        <Button variant="ghost" onClick={() => setAdding(true)}>
          + Add a relative
        </Button>
      )}
    </div>
  );
}

function MemberCard({
  member,
  onUpdate,
  onRemove,
}: {
  member: FamilyMember;
  onUpdate: (p: Partial<FamilyMember>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(member.conditions.length === 0);
  const [newCond, setNewCond] = useState<Condition>("type2_diabetes");

  function addCondition() {
    onUpdate({
      conditions: [
        ...member.conditions,
        { id: uid(), condition: newCond, ageAtDiagnosis: null },
      ],
    });
  }

  function updateCondition(id: string, age: number | null) {
    onUpdate({
      conditions: member.conditions.map((c) =>
        c.id === id ? { ...c, ageAtDiagnosis: age } : c,
      ),
    });
  }

  function removeCondition(id: string) {
    onUpdate({ conditions: member.conditions.filter((c) => c.id !== id) });
  }

  return (
    <Card>
      <div className="flex items-start justify-between" onClick={() => setOpen(!open)}>
        <div className="flex-1">
          <div className="font-medium">{RELATION_LABELS[member.relation]}</div>
          <div className="text-[14px] text-[var(--color-muted)] mt-0.5">
            {member.conditions.length
              ? member.conditions
                  .map(
                    (c) =>
                      CONDITION_LABELS[c.condition] +
                      (c.ageAtDiagnosis != null ? ` @${c.ageAtDiagnosis}` : ""),
                  )
                  .join(", ")
              : "No conditions recorded"}
          </div>
        </div>
        <span className="text-[var(--color-muted)] pl-3 text-[13px]">{open ? "Close" : "Edit"}</span>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-[var(--color-line)]">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <div className="text-[13px] text-[var(--color-muted)] mb-2">Status</div>
              <Select
                value={member.alive === false ? "dead" : "alive"}
                onChange={(v) => onUpdate({ alive: v === "alive" })}
                options={[
                  { value: "alive", label: "Living" },
                  { value: "dead", label: "Deceased" },
                ]}
              />
            </div>
            <div>
              <div className="text-[13px] text-[var(--color-muted)] mb-2">
                {member.alive === false ? "Age at death" : "Age now"}
              </div>
              <NumberInput
                value={member.ageNowOrAtDeath}
                onChange={(v) => onUpdate({ ageNowOrAtDeath: v })}
                placeholder="—"
              />
            </div>
          </div>

          <div className="text-[13px] text-[var(--color-muted)] mb-2">Conditions</div>
          {member.conditions.map((c) => (
            <div key={c.id} className="flex items-center gap-2 mb-2">
              <div className="flex-1 text-[15px] truncate">{CONDITION_LABELS[c.condition]}</div>
              <div className="w-24">
                <NumberInput
                  value={c.ageAtDiagnosis}
                  onChange={(v) => updateCondition(c.id, v)}
                  placeholder="age"
                />
              </div>
              <button
                onClick={() => removeCondition(c.id)}
                className="text-[var(--color-muted)] px-2 text-xl leading-none"
              >
                ×
              </button>
            </div>
          ))}

          <p className="text-[13px] text-[var(--color-muted)] my-3 leading-snug">
            Age at diagnosis matters more than the diagnosis itself — it's what separates an
            inherited pattern from an ordinary one. Guess if you have to.
          </p>

          <div className="flex gap-2 items-center mb-3">
            <div className="flex-1">
              <Select value={newCond} onChange={setNewCond} options={CONDITION_OPTIONS} />
            </div>
            <button
              onClick={addCondition}
              className="px-4 py-3 rounded-xl bg-white border border-[var(--color-line)]"
            >
              Add
            </button>
          </div>

          <Button variant="danger" onClick={onRemove}>
            Remove {RELATION_LABELS[member.relation].toLowerCase()}
          </Button>
        </div>
      )}
    </Card>
  );
}
