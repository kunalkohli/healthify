import { useMemo, useState } from "react";
import {
  ANALYTE_META,
  Analyte,
  ageFrom,
  uid,
  type JournalEntry,
  type Profile,
} from "../core/schema/index.ts";
import { snapshot } from "../core/risk/index.ts";
import {
  formatWeight,
  labFromDisplay,
  labHasSiVariant,
  labUnitLabel,
  type LabUnitSystem,
  type UnitSystem,
} from "../core/units.ts";
import {
  Band,
  Button,
  Card,
  Field,
  H1,
  NumberInput,
  Screen,
  Select,
  Sub,
  WeightInput,
} from "./primitives.tsx";

function analyteOptions(sys: LabUnitSystem) {
  return Analyte.options.map((a) => ({
    value: a,
    label: `${ANALYTE_META[a].label} (${labUnitLabel(a, sys, ANALYTE_META[a].unit)})`,
  }));
}

export function Today({
  profile,
  onProfile,
  journal,
  onJournal,
  units,
  onUnits,
  labUnits,
  onLabUnits,
  onGoChat,
}: {
  profile: Profile;
  onProfile: (p: Profile) => void;
  journal: JournalEntry[];
  onJournal: (j: JournalEntry[]) => void;
  units: UnitSystem;
  onUnits: (u: UnitSystem) => void;
  labUnits: LabUnitSystem;
  onLabUnits: (u: LabUnitSystem) => void;
  onGoChat: () => void;
}) {
  const s = useMemo(() => snapshot(profile), [profile]);
  const [note, setNote] = useState("");
  const [weight, setWeight] = useState<number | null>(null);
  const [addingLab, setAddingLab] = useState(false);
  const [labAnalyte, setLabAnalyte] = useState<Analyte>("hba1c_pct");
  const [labValue, setLabValue] = useState<number | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = journal.filter((j) => j.date === today);
  const topFlag = s.flags.find((f) => f.severity === "action");
  const headline = s.risks.find((r) => r.outcome.status === "ok");

  function addNote() {
    if (!note.trim()) return;
    onJournal([
      ...journal,
      {
        id: uid(),
        date: today,
        kind: "note",
        text: note.trim(),
        value: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    setNote("");
  }

  function logWeight() {
    if (weight == null) return;
    onProfile({
      ...profile,
      anthropometrics: { ...profile.anthropometrics, weightKg: weight },
    });
    onJournal([
      ...journal,
      {
        id: uid(),
        date: today,
        kind: "weight",
        text: formatWeight(weight, units),
        value: weight,
        createdAt: new Date().toISOString(),
      },
    ]);
    setWeight(null);
  }

  function addLab() {
    if (labValue == null) return;
    onProfile({
      ...profile,
      labs: [
        ...profile.labs,
        {
          id: uid(),
          analyte: labAnalyte,
          // Stored canonically in US units; the engine never sees SI.
          value: labFromDisplay(labAnalyte, labValue, labUnits),
          takenAt: today,
        },
      ],
    });
    setLabValue(null);
    setAddingLab(false);
  }

  return (
    <Screen>
      <H1>{greeting()}{profile.name ? `, ${profile.name}` : ""}</H1>
      <Sub>
        {ageFrom(profile.birthYear)} years old · {formatWeight(profile.anthropometrics.weightKg, units)} ·
        BMI {s.bmi.bmi.toFixed(1)}
      </Sub>

      {headline && headline.outcome.status === "ok" && (
        <Card>
          <div className="flex justify-between items-start">
            <div className="flex-1 pr-3">
              <div className="text-[14px] text-[var(--color-muted)]">
                {headline.model.question}
              </div>
              <div className="text-3xl font-semibold mt-1">
                {headline.outcome.label.split(" — ")[0]}
              </div>
            </div>
            <Band band={headline.outcome.band} />
          </div>
        </Card>
      )}

      {topFlag && (
        <Card>
          <div className="flex items-start gap-2.5">
            <span className="shrink-0 mt-1.5 w-2 h-2 rounded-full bg-[var(--color-danger)]" />
            <div>
              <div className="font-medium leading-snug">{topFlag.title}</div>
              {topFlag.action && (
                <p className="text-[14px] text-[var(--color-accent-ink)] mt-1.5 leading-relaxed">
                  {topFlag.action}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {s.missing.length > 0 && (
        <Card onClick={onGoChat}>
          <div className="font-medium">
            {s.missing.length} missing input{s.missing.length > 1 ? "s" : ""} blocking a real number
          </div>
          <div className="text-[14px] text-[var(--color-muted)] mt-1 leading-snug">
            {s.missing.map((m) => m.label).join(", ")}
          </div>
        </Card>
      )}

      <h2 className="text-[13px] uppercase tracking-wide text-[var(--color-muted)] mt-8 mb-3">
        Log
      </h2>

      <Card>
        <Field label="Weight today">
          <div className="flex gap-2">
            <div className="flex-1">
              <WeightInput
                kg={weight}
                onChange={setWeight}
                system={units}
                onSystemChange={onUnits}
                placeholder={formatWeight(profile.anthropometrics.weightKg, units).split(" ")[0]}
              />
            </div>
            <button
              onClick={logWeight}
              disabled={weight == null}
              className="px-4 rounded-xl bg-white border border-[var(--color-line)] disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </Field>

        <Field label="Note">
          <div className="flex gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNote()}
              placeholder="Ate, felt, did…"
              className="flex-1 rounded-xl bg-[var(--color-surface)] border border-[var(--color-line)] px-4 py-3 outline-none focus:border-[var(--color-accent)] focus:bg-white"
            />
            <button
              onClick={addNote}
              className="px-4 rounded-xl bg-white border border-[var(--color-line)]"
            >
              Add
            </button>
          </div>
        </Field>

        {addingLab ? (
          <div>
            <Field label="Lab result">
              <Select value={labAnalyte} onChange={setLabAnalyte} options={analyteOptions(labUnits)} />
            </Field>
            <div className="flex gap-2">
              <div className="flex-1">
                <NumberInput
                  value={labValue}
                  onChange={setLabValue}
                  suffix={labUnitLabel(labAnalyte, labUnits, ANALYTE_META[labAnalyte].unit)}
                  // Only offer the swap where an SI form genuinely exists.
                  onSuffixTap={
                    labHasSiVariant(labAnalyte)
                      ? () => onLabUnits(labUnits === "us" ? "si" : "us")
                      : undefined
                  }
                />
              </div>
              <button
                onClick={addLab}
                className="px-4 rounded-xl bg-white border border-[var(--color-line)]"
              >
                Save
              </button>
              <button
                onClick={() => setAddingLab(false)}
                className="px-3 text-[var(--color-muted)]"
              >
                ×
              </button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setAddingLab(true)}>
            + Add a lab result
          </Button>
        )}
      </Card>

      {todayEntries.length > 0 && (
        <Card>
          {todayEntries.map((e) => (
            <div
              key={e.id}
              className="flex gap-3 py-1.5 border-b border-[var(--color-line)] last:border-0 text-[14px]"
            >
              <span className="text-[var(--color-muted)] w-16 shrink-0">{e.kind}</span>
              <span className="flex-1">{e.text}</span>
            </div>
          ))}
        </Card>
      )}
    </Screen>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Morning";
  if (h < 18) return "Afternoon";
  return "Evening";
}
