import { useMemo, useState } from "react";
import type { Profile } from "../core/schema/index.ts";
import { snapshot } from "../core/risk/index.ts";
import { Band, Card, Empty, H1, Screen, Sub } from "./primitives.tsx";

export function Risks({ profile }: { profile: Profile }) {
  const s = useMemo(() => snapshot(profile), [profile]);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Screen>
      <H1>Assessment</H1>
      <Sub>
        Every number here comes from a published calculator, not from a language model. Where a
        calculator can't run, it says so instead of guessing.
      </Sub>

      {/* BMI */}
      <Card>
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[15px]">Body mass index</span>
          <span className="text-xl font-semibold">{s.bmi.bmi.toFixed(1)}</span>
        </div>
        <div className="text-[14px] text-[var(--color-muted)] capitalize">{s.bmi.category}</div>
        {s.bmi.thresholds.adjusted && (
          <p className="text-[13px] text-[var(--color-muted)] mt-2 leading-snug border-t border-[var(--color-line)] pt-2">
            {s.bmi.thresholds.rationale}
          </p>
        )}
      </Card>

      {/* Risk models */}
      {s.risks.map(({ model, outcome }) => {
        const id = model.id;
        const isOpen = open === id;
        return (
          <Card key={id} onClick={() => setOpen(isOpen ? null : id)}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="font-medium">{model.name}</div>
                <div className="text-[13px] text-[var(--color-muted)] mt-0.5 leading-snug">
                  {model.question}
                </div>
              </div>
              <div className="text-right shrink-0">
                {outcome.status === "ok" ? (
                  <>
                    <div className="text-xl font-semibold">{outcome.label.split(" — ")[0]}</div>
                    <div className="mt-1">
                      <Band band={outcome.band} />
                    </div>
                  </>
                ) : (
                  <span className="text-[13px] text-[var(--color-muted)]">
                    {outcome.status === "partial" ? "Need data" : "N/A"}
                  </span>
                )}
              </div>
            </div>

            {isOpen && (
              <div className="mt-4 pt-4 border-t border-[var(--color-line)] text-[15px] leading-relaxed">
                {outcome.status === "ok" && (
                  <>
                    <p>{outcome.summary}</p>
                    <Section title="Inputs used">
                      {Object.entries(outcome.inputsUsed).map(([k, v]) => (
                        <Row key={k} k={k} v={String(v)} />
                      ))}
                    </Section>
                    {outcome.modifiers.length > 0 && (
                      <Section title="What moves this">
                        {outcome.modifiers.map((m, i) => (
                          <li key={i} className="flex gap-2 mb-2 text-[14px]">
                            <span
                              className={`shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${
                                m.impact === "high"
                                  ? "bg-[var(--color-accent)]"
                                  : m.impact === "medium"
                                    ? "bg-yellow-400"
                                    : "bg-[var(--color-muted)]"
                              }`}
                            />
                            <span className={m.modifiable ? "" : "text-[var(--color-muted)]"}>
                              {m.text}
                            </span>
                          </li>
                        ))}
                      </Section>
                    )}
                  </>
                )}

                {outcome.status === "partial" && (
                  <>
                    <p>{outcome.summary}</p>
                    <Section title="Missing">
                      {outcome.missing.map((m) => (
                        <li key={m.label} className="mb-2 text-[14px]">
                          <span className="text-[var(--color-ink)]">{m.label}</span>
                          <span className="text-[var(--color-muted)]"> — {m.why}</span>
                        </li>
                      ))}
                    </Section>
                    {outcome.provisional && (
                      <Section title={outcome.provisional.label}>
                        <p className="text-[14px] text-[var(--color-muted)]">
                          {outcome.provisional.detail}
                        </p>
                      </Section>
                    )}
                  </>
                )}

                {outcome.status === "not_applicable" && (
                  <p className="text-[var(--color-muted)]">{outcome.reason}</p>
                )}

                <p className="text-[12px] text-[var(--color-muted)] mt-4 pt-3 border-t border-[var(--color-line)]">
                  {model.citation}
                </p>
              </div>
            )}
          </Card>
        );
      })}

      {/* Other measures */}
      {s.metrics.length > 0 && (
        <>
          <h2 className="text-[13px] uppercase tracking-wide text-[var(--color-muted)] mt-8 mb-3">
            Other measures
          </h2>
          {s.metrics.map((m) => {
            const isOpen = open === m.id;
            return (
              <Card key={m.id} onClick={() => setOpen(isOpen ? null : m.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="font-medium">{m.label}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-semibold">{m.value}</div>
                    <div className="mt-1">
                      <Band band={m.band} />
                    </div>
                  </div>
                </div>
                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-[var(--color-line)] text-[15px] leading-relaxed">
                    <p>{m.detail}</p>
                    {m.citation && (
                      <p className="text-[12px] text-[var(--color-muted)] mt-3">{m.citation}</p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </>
      )}

      {/* Family flags */}
      {s.flags.length > 0 && (
        <>
          <h2 className="text-[13px] uppercase tracking-wide text-[var(--color-muted)] mt-8 mb-3">
            Family history flags
          </h2>
          {s.flags.map((f) => (
            <Card key={f.id}>
              <div className="flex items-start gap-2.5">
                <span
                  className={`shrink-0 mt-1.5 w-2 h-2 rounded-full ${
                    f.severity === "action"
                      ? "bg-[var(--color-danger)]"
                      : f.severity === "notable"
                        ? "bg-yellow-400"
                        : "bg-[var(--color-muted)]"
                  }`}
                />
                <div className="flex-1">
                  <div className="font-medium leading-snug">{f.title}</div>
                  <p className="text-[14px] text-[var(--color-muted)] mt-1.5 leading-relaxed">
                    {f.detail}
                  </p>
                  {f.action && (
                    <p className="text-[14px] mt-2 leading-relaxed text-[var(--color-accent-ink)]">
                      {f.action}
                    </p>
                  )}
                  {f.citation && (
                    <p className="text-[12px] text-[var(--color-muted)] mt-2">{f.citation}</p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </>
      )}

      {/* Missing tests */}
      {s.missing.length > 0 && (
        <>
          <h2 className="text-[13px] uppercase tracking-wide text-[var(--color-muted)] mt-8 mb-3">
            Worth asking your doctor for
          </h2>
          <Card>
            {s.missing.map((m) => (
              <div key={m.label} className="mb-3 last:mb-0">
                <div className="font-medium text-[15px]">{m.label}</div>
                <div className="text-[14px] text-[var(--color-muted)] leading-snug mt-0.5">
                  {m.why}
                </div>
              </div>
            ))}
          </Card>
        </>
      )}

      {s.risks.length === 0 && <Empty>Nothing to assess yet.</Empty>}

      <p className="text-[13px] text-[var(--color-muted)] leading-relaxed mt-8 mb-4">
        This is an educational tool, not a diagnosis. Risk calculators describe populations, not
        individuals — a low number is not a guarantee and a high one is not a verdict.
      </p>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="text-[13px] uppercase tracking-wide text-[var(--color-muted)] mb-2">
        {title}
      </div>
      <ul>{children}</ul>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <li className="flex justify-between gap-3 text-[14px] py-1 border-b border-[var(--color-line)] last:border-0">
      <span className="text-[var(--color-muted)]">{k}</span>
      <span className="text-right">{v}</span>
    </li>
  );
}
