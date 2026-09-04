import { useState } from "react";
import {
  CONDITION_LABELS,
  ETHNICITY_LABELS,
  Ethnicity,
  SexAtBirth,
  SmokingStatus,
  emptyProfile,
  uid,
  type Condition,
  type Profile,
} from "../core/schema/index.ts";
import { bmiThresholds } from "../core/risk/index.ts";
import type { UnitSystem } from "../core/units.ts";
import {
  Button,
  Chips,
  Field,
  H1,
  HeightInput,
  LengthInput,
  NumberInput,
  Screen,
  Select,
  Sub,
  TextInput,
  Toggle,
  WeightInput,
} from "./primitives.tsx";
import { FamilyEditor } from "./FamilyEditor.tsx";

const ETHNICITY_OPTIONS = Ethnicity.options.map((e) => ({
  value: e,
  label: ETHNICITY_LABELS[e],
}));

const OWN_CONDITIONS: Condition[] = [
  "type2_diabetes",
  "prediabetes",
  "hypertension",
  "high_cholesterol",
  "heart_attack",
  "stroke",
  "kidney_disease",
  "thyroid_disease",
  "sleep_apnea",
  "asthma",
  "depression",
  "anxiety",
  "celiac",
  "ibd",
  "rheumatoid_arthritis",
];

const STEPS = ["You", "Body", "Vitals", "Lifestyle", "Health", "Family"] as const;

/**
 * Draft type where every required numeric can legitimately be empty.
 *
 * The earlier version stored these straight onto Profile and coerced null back
 * to a default on every keystroke — so clearing the weight field silently
 * rewrote it to 70 and the old value reappeared. Required numbers stay nullable
 * until the user finishes, and we simply refuse to advance while one is blank.
 */
type Draft = Omit<Profile, "birthYear" | "anthropometrics" | "lifestyle"> & {
  birthYear: number | null;
  anthropometrics: { heightCm: number | null; weightKg: number | null; waistCm: number | null };
  lifestyle: Omit<
    Profile["lifestyle"],
    "activityMinutesPerWeek" | "alcoholPerWeek" | "averageSleepHours"
  > & {
    activityMinutesPerWeek: number | null;
    alcoholPerWeek: number | null;
    averageSleepHours: number | null;
  };
};

function toDraft(p: Profile): Draft {
  return { ...p, anthropometrics: { ...p.anthropometrics }, lifestyle: { ...p.lifestyle } };
}

function fromDraft(d: Draft): Profile {
  return {
    ...d,
    birthYear: d.birthYear!,
    anthropometrics: {
      heightCm: d.anthropometrics.heightCm!,
      weightKg: d.anthropometrics.weightKg!,
      waistCm: d.anthropometrics.waistCm,
    },
    lifestyle: {
      ...d.lifestyle,
      activityMinutesPerWeek: d.lifestyle.activityMinutesPerWeek ?? 0,
      alcoholPerWeek: d.lifestyle.alcoholPerWeek ?? 0,
      averageSleepHours: d.lifestyle.averageSleepHours ?? 7,
    },
  } as Profile;
}

function blankDraft(): Draft {
  const d = toDraft(emptyProfile());
  // Start genuinely empty rather than pre-filled with numbers the user
  // then has to notice and correct.
  d.birthYear = null;
  d.anthropometrics = { heightCm: null, weightKg: null, waistCm: null };
  d.lifestyle.activityMinutesPerWeek = null;
  d.lifestyle.alcoholPerWeek = null;
  d.lifestyle.averageSleepHours = null;
  return d;
}

export function Onboarding({
  initial,
  units,
  onUnits,
  onDone,
  onCancel,
}: {
  initial?: Profile | null;
  units: UnitSystem;
  onUnits: (u: UnitSystem) => void;
  onDone: (p: Profile) => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(() => (initial ? toDraft(initial) : blankDraft()));
  const [touched, setTouched] = useState(false);

  const patch = (x: Partial<Draft>) => setD({ ...d, ...x });
  const last = step === STEPS.length - 1;

  const thisYear = new Date().getFullYear();
  const errors: Record<string, string | null> = {
    birthYear:
      d.birthYear == null
        ? "Required."
        : d.birthYear < 1900 || d.birthYear > thisYear
          ? "That doesn't look right."
          : null,
    ethnicity: d.ethnicity.length === 0 ? "Pick at least one." : null,
    heightCm: d.anthropometrics.heightCm == null ? "Required." : null,
    weightKg: d.anthropometrics.weightKg == null ? "Required." : null,
  };

  const stepErrors: Record<number, (string | null)[]> = {
    0: [errors.birthYear, errors.ethnicity],
    1: [errors.heightCm, errors.weightKg],
  };
  const blocked = (stepErrors[step] ?? []).some(Boolean);
  const show = (k: string) => (touched ? errors[k] : null);

  function advance() {
    if (blocked) {
      setTouched(true);
      return;
    }
    setTouched(false);
    if (last) onDone(fromDraft(d));
    else setStep(step + 1);
  }

  return (
    <Screen>
      <div className="flex gap-1.5 pt-6 items-center">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= step ? "bg-[var(--color-accent)]" : "bg-[var(--color-line)]"
            }`}
          />
        ))}
        {onCancel && (
          <button onClick={onCancel} className="text-[13px] text-[var(--color-muted)] pl-3">
            Cancel
          </button>
        )}
      </div>

      {step === 0 && (
        <>
          <H1>Let's start with you</H1>
          <Sub>
            This stays on your phone. Nothing is uploaded anywhere except the questions you
            explicitly send to the coach.
          </Sub>
          <Field label="Name (optional)">
            <TextInput
              value={d.name ?? ""}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="What should I call you?"
            />
          </Field>
          <Field label="Birth year" error={show("birthYear")}>
            <NumberInput
              value={d.birthYear}
              onChange={(v) => patch({ birthYear: v })}
              placeholder="1990"
            />
          </Field>
          <Field
            label="Sex at birth"
            hint="Used because the risk equations have separate coefficients by sex — not as an identity question."
          >
            <Select
              value={d.sexAtBirth}
              onChange={(v) => patch({ sexAtBirth: v })}
              options={SexAtBirth.options.map((s) => ({
                value: s,
                label: s[0].toUpperCase() + s.slice(1),
              }))}
            />
          </Field>
          <Field
            label="Ethnicity"
            error={show("ethnicity")}
            hint="This genuinely changes the maths. South and East Asian ancestry lowers the diabetes-screening BMI threshold from 25 to 23, and South Asian ancestry is a formal cardiovascular risk enhancer. Select all that apply."
          >
            <Chips
              values={d.ethnicity}
              options={ETHNICITY_OPTIONS}
              onToggle={(v) =>
                patch({
                  ethnicity: d.ethnicity.includes(v)
                    ? d.ethnicity.filter((x) => x !== v)
                    : [...d.ethnicity, v],
                })
              }
            />
          </Field>
        </>
      )}

      {step === 1 && (
        <>
          <H1>Your body</H1>
          <Sub>
            Waist is the single most valuable number here — more predictive than BMI. Tap any
            unit to switch it.
          </Sub>

          <Field label="Height" error={show("heightCm")}>
            <HeightInput
              cm={d.anthropometrics.heightCm}
              system={units}
              onSystemChange={onUnits}
              onChange={(v) => patch({ anthropometrics: { ...d.anthropometrics, heightCm: v } })}
            />
          </Field>
          <Field label="Weight" error={show("weightKg")}>
            <WeightInput
              kg={d.anthropometrics.weightKg}
              system={units}
              onSystemChange={onUnits}
              onChange={(v) => patch({ anthropometrics: { ...d.anthropometrics, weightKg: v } })}
              placeholder={units === "metric" ? "75" : "165"}
            />
          </Field>
          <Field
            label="Waist"
            hint="Measure at the navel, relaxed, after breathing out. Worth doing properly — it feeds three separate calculations."
          >
            <LengthInput
              cm={d.anthropometrics.waistCm}
              system={units}
              onSystemChange={onUnits}
              onChange={(v) => patch({ anthropometrics: { ...d.anthropometrics, waistCm: v } })}
              placeholder="optional but valuable"
            />
          </Field>
          <BmiPreview d={d} />
        </>
      )}

      {step === 2 && (
        <>
          <H1>Vitals</H1>
          <Sub>
            Skip anything you don't know. I'd rather show you a gap than fill it with a guess.
          </Sub>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Systolic">
              <NumberInput
                value={d.vitals.systolic}
                onChange={(v) => patch({ vitals: { ...d.vitals, systolic: v } })}
                placeholder="120"
              />
            </Field>
            <Field label="Diastolic">
              <NumberInput
                value={d.vitals.diastolic}
                onChange={(v) => patch({ vitals: { ...d.vitals, diastolic: v } })}
                placeholder="80"
              />
            </Field>
          </div>
          <Field label="Resting heart rate">
            <NumberInput
              value={d.vitals.restingHeartRate}
              onChange={(v) => patch({ vitals: { ...d.vitals, restingHeartRate: v } })}
              suffix="bpm"
              placeholder="optional"
            />
          </Field>
          <Toggle
            label="I take blood pressure medication"
            value={d.vitals.onBloodPressureMeds}
            onChange={(v) => patch({ vitals: { ...d.vitals, onBloodPressureMeds: v } })}
          />
        </>
      )}

      {step === 3 && (
        <>
          <H1>Lifestyle</H1>
          <Sub>These are the inputs you can actually change.</Sub>
          <Field label="Smoking">
            <Select
              value={d.lifestyle.smoking}
              onChange={(v) => patch({ lifestyle: { ...d.lifestyle, smoking: v } })}
              options={SmokingStatus.options.map((s) => ({
                value: s,
                label: {
                  never: "Never smoked",
                  former: "Used to smoke",
                  current: "Currently smoke",
                }[s],
              }))}
            />
          </Field>
          <Field
            label="Moderate exercise per week"
            hint="Brisk walking counts. Anything that raises your breathing rate."
          >
            <NumberInput
              value={d.lifestyle.activityMinutesPerWeek}
              onChange={(v) => patch({ lifestyle: { ...d.lifestyle, activityMinutesPerWeek: v } })}
              suffix="min"
              placeholder="150"
            />
          </Field>
          <Field label="Alcohol per week">
            <NumberInput
              value={d.lifestyle.alcoholPerWeek}
              onChange={(v) => patch({ lifestyle: { ...d.lifestyle, alcoholPerWeek: v } })}
              suffix="drinks"
              placeholder="0"
            />
          </Field>
          <Field label="Average sleep">
            <NumberInput
              value={d.lifestyle.averageSleepHours}
              onChange={(v) => patch({ lifestyle: { ...d.lifestyle, averageSleepHours: v } })}
              suffix="hrs"
              placeholder="7"
            />
          </Field>
          <Toggle
            label="I eat vegetables, fruit or berries most days"
            value={d.lifestyle.eatsVegetablesDaily}
            onChange={(v) => patch({ lifestyle: { ...d.lifestyle, eatsVegetablesDaily: v } })}
          />
        </>
      )}

      {step === 4 && (
        <>
          <H1>Your health</H1>
          <Sub>Conditions you've been diagnosed with.</Sub>
          <Field label="Diagnosed conditions">
            <Chips
              values={d.ownConditions.map((c) => c.condition)}
              options={OWN_CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABELS[c] }))}
              onToggle={(v) =>
                patch({
                  ownConditions: d.ownConditions.some((c) => c.condition === v)
                    ? d.ownConditions.filter((c) => c.condition !== v)
                    : [...d.ownConditions, { id: uid(), condition: v, diagnosedAge: null }],
                })
              }
            />
          </Field>
          <Toggle
            label="I've been told my blood sugar was high at some point"
            value={d.everHadHighGlucose}
            onChange={(v) => patch({ everHadHighGlucose: v })}
          />
          <Field label="Medications" hint="One per line.">
            <textarea
              rows={3}
              value={d.medications.map((m) => m.name).join("\n")}
              onChange={(e) =>
                patch({
                  medications: e.target.value
                    .split("\n")
                    .filter((x) => x.trim())
                    .map((name) => ({ id: uid(), name: name.trim() })),
                })
              }
              placeholder="Metformin 500mg"
              className="w-full rounded-xl bg-[var(--color-surface)] border border-[var(--color-line)] px-4 py-3 outline-none focus:border-[var(--color-accent)] focus:bg-white"
            />
          </Field>
          <Field label="Allergies & foods you avoid" hint="One per line.">
            <textarea
              rows={3}
              value={d.allergies.join("\n")}
              onChange={(e) =>
                patch({ allergies: e.target.value.split("\n").filter((x) => x.trim()) })
              }
              placeholder="Shellfish&#10;Peanuts"
              className="w-full rounded-xl bg-[var(--color-surface)] border border-[var(--color-line)] px-4 py-3 outline-none focus:border-[var(--color-accent)] focus:bg-white"
            />
          </Field>
        </>
      )}

      {step === 5 && (
        <>
          <H1>Family history</H1>
          <Sub>
            This is the part that does the most work. Add whoever you know about — parents and
            siblings matter most, grandparents and aunts/uncles still count.
          </Sub>
          <FamilyEditor family={d.family} onChange={(f) => patch({ family: f })} />
        </>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-50">
        {/* fade so content scrolls out gracefully behind the bar */}
        <div className="h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        <div className="bg-white px-5 pt-1 pb-safe">
        <div className="flex gap-2">
          {step > 0 && (
            <div className="w-28">
              <Button
                variant="ghost"
                onClick={() => {
                  setTouched(false);
                  setStep(step - 1);
                }}
              >
                Back
              </Button>
            </div>
          )}
          <div className="flex-1">
            <Button onClick={advance}>{last ? "See my assessment" : "Continue"}</Button>
          </div>
        </div>
        {touched && blocked && (
          <p className="text-[13px] text-[var(--color-danger)] text-center mt-2">
            Fill in the highlighted fields to continue.
          </p>
        )}
        </div>
      </div>
    </Screen>
  );
}

function BmiPreview({ d }: { d: Draft }) {
  const h = d.anthropometrics.heightCm;
  const w = d.anthropometrics.weightKg;
  const t = bmiThresholds(d.ethnicity);

  if (h == null || w == null) {
    return (
      <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-line)] p-4 text-[14px] text-[var(--color-muted)]">
        Enter height and weight to see your BMI.
      </div>
    );
  }

  const m = h / 100;
  const bmi = w / (m * m);
  const over = bmi >= t.overweight;

  return (
    <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-line)] p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[var(--color-muted)] text-[14px]">BMI</span>
        <span
          className={`text-2xl font-semibold ${
            over ? "text-[var(--color-warn)]" : "text-[var(--color-accent-ink)]"
          }`}
        >
          {bmi.toFixed(1)}
        </span>
      </div>
      {t.adjusted && (
        <p className="text-[13px] text-[var(--color-muted)] mt-2 leading-snug">
          Using a threshold of {t.overweight} rather than 25. {t.rationale}
        </p>
      )}
    </div>
  );
}
