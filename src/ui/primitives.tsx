import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconCheck, IconChevronDown } from "./icons.tsx";
import {
  cmToFtIn,
  cmToIn,
  ftInToCm,
  inToCm,
  kgToLb,
  lbToKg,
  lengthUnit,
  round,
  weightUnit,
  type UnitSystem,
} from "../core/units.ts";

export function Screen({ children }: { children: ReactNode }) {
  return <div className="min-h-full px-5 pb-28 safe-top">{children}</div>;
}

export function H1({ children }: { children: ReactNode }) {
  return <h1 className="text-[28px] font-semibold tracking-tight pt-6 pb-1">{children}</h1>;
}

export function Sub({ children }: { children: ReactNode }) {
  return <p className="text-[15px] text-[var(--color-muted)] leading-relaxed pb-5">{children}</p>;
}

export function Card({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl bg-white border border-[var(--color-line)] p-4 mb-3 shadow-[0_1px_2px_rgba(16,16,20,0.04)] ${
        onClick ? "active:bg-[var(--color-surface)] cursor-pointer" : ""
      }`}
    >
      {children}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <label className="block text-[13px] uppercase tracking-wide text-[var(--color-muted)] mb-2">
      {children}
    </label>
  );
}

export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string | null;
}) {
  return (
    <div className="mb-5">
      <Label>{label}</Label>
      {children}
      {error ? (
        <p className="text-[13px] text-[var(--color-danger)] mt-2 leading-snug">{error}</p>
      ) : hint ? (
        <p className="text-[13px] text-[var(--color-muted)] mt-2 leading-snug">{hint}</p>
      ) : null}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl bg-[var(--color-surface)] border border-[var(--color-line)] px-4 py-3 outline-none focus:border-[var(--color-accent)] focus:bg-white transition-colors placeholder:text-[#a3a3ac]";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputCls} />;
}

/**
 * Numeric input that keeps its own text buffer.
 *
 * Without this, clearing the field emits `null`, the parent coerces it back to a
 * default, and the old value reappears under the cursor. The buffer lets the
 * field sit genuinely empty while the parent holds `null`, and only re-syncs
 * when the value changes from outside.
 */
export function NumberInput({
  value,
  onChange,
  suffix,
  onSuffixTap,
  ...rest
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  suffix?: string;
  /** When set, the unit suffix becomes a button that switches units. */
  onSuffixTap?: () => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const focused = useRef(false);

  // Accept external updates, but never yank the text out from under the user.
  useEffect(() => {
    if (focused.current) return;
    const next = value == null ? "" : String(value);
    if (Number(text) !== value || (text === "" && value != null)) setText(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative">
      <input
        {...rest}
        type="text"
        inputMode="decimal"
        value={text}
        onFocus={() => (focused.current = true)}
        onBlur={() => (focused.current = false)}
        onChange={(e) => {
          const raw = e.target.value;
          // Allow empty, a lone minus, and partial decimals like "7."
          if (raw !== "" && !/^-?\d*\.?\d*$/.test(raw)) return;
          setText(raw);
          if (raw === "" || raw === "-" || raw === ".") onChange(null);
          else onChange(Number(raw));
        }}
        className={inputCls + (suffix ? (onSuffixTap ? " pr-16" : " pr-14") : "")}
      />
      {suffix &&
        (onSuffixTap ? (
          <button
            type="button"
            onClick={onSuffixTap}
            aria-label={`Change units from ${suffix}`}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg text-[14px] font-medium text-[var(--color-accent-ink)] bg-[var(--color-accent-soft)] border border-green-200/70 active:bg-green-100 leading-none"
          >
            {suffix}
          </button>
        ) : (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none text-[15px]">
            {suffix}
          </span>
        ))}
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={inputCls + " appearance-none bg-no-repeat"}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236c6c75' stroke-width='1.75' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")",
        backgroundPosition: "right 1rem center",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Chips<T extends string>({
  values,
  onToggle,
  options,
}: {
  values: T[];
  onToggle: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = values.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            className={`px-3.5 py-2 rounded-full text-[14px] border transition-colors ${
              on
                ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)] font-medium"
                : "bg-white border-[var(--color-line)] text-[var(--color-ink)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between rounded-xl bg-white border border-[var(--color-line)] px-4 py-3.5 mb-3"
    >
      <span className="text-left pr-4">{label}</span>
      <span
        className={`shrink-0 w-[50px] h-[30px] rounded-full transition-colors relative ${
          value ? "bg-[var(--color-accent)]" : "bg-[#d4d4da]"
        }`}
      >
        <span
          className={`absolute top-[3px] w-6 h-6 rounded-full bg-white shadow-sm transition-all ${
            value ? "left-[23px]" : "left-[3px]"
          }`}
        />
      </span>
    </button>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
}) {
  const base =
    "w-full rounded-xl px-4 py-3.5 font-medium transition-colors disabled:opacity-40 active:scale-[0.99]";
  const styles = {
    primary: "bg-[var(--color-accent)] text-white",
    ghost: "bg-white border border-[var(--color-line)] text-[var(--color-ink)]",
    danger: "bg-[var(--color-danger-soft)] border border-red-200 text-[var(--color-danger)]",
  };
  return (
    <button disabled={disabled} onClick={onClick} className={`${base} ${styles[variant]}`}>
      {children}
    </button>
  );
}

export function Band({ band }: { band: string }) {
  const colors: Record<string, string> = {
    low: "text-[var(--color-accent-ink)] bg-[var(--color-accent-soft)] border-green-200",
    slightly_elevated: "text-[#a16207] bg-[#fefce8] border-yellow-200",
    moderate: "text-[var(--color-warn)] bg-[var(--color-warn-soft)] border-orange-200",
    high: "text-[var(--color-danger)] bg-[var(--color-danger-soft)] border-red-200",
    very_high: "text-white bg-[var(--color-danger)] border-[var(--color-danger)]",
  };
  const labels: Record<string, string> = {
    low: "Low",
    slightly_elevated: "Slightly elevated",
    moderate: "Moderate",
    high: "High",
    very_high: "Very high",
  };
  return (
    <span
      className={`text-[12px] px-2.5 py-1 rounded-full border whitespace-nowrap ${colors[band] ?? colors.moderate}`}
    >
      {labels[band] ?? band}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="text-center text-[var(--color-muted)] text-[15px] py-16 leading-relaxed">
      {children}
    </div>
  );
}

export type PickerOption<T extends string> = {
  value: T;
  label: string;
  /** Short quality/cost descriptor — only shown in the open list, not the trigger. */
  note?: string;
  badge?: string;
};

/**
 * Bottom-sheet picker.
 *
 * A native <select> renders identical text when closed and open, so the
 * trigger would inherit the descriptor text too. This keeps the collapsed
 * state to just the name and reveals the tradeoffs only once you open it.
 */
export function Picker<T extends string>({
  value,
  onChange,
  options,
  title,
}: {
  value: T;
  onChange: (v: T) => void;
  options: PickerOption<T>[];
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  // Don't let the page scroll behind the sheet.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between rounded-xl bg-[var(--color-surface)] border border-[var(--color-line)] px-4 py-3 text-left"
      >
        <span className="truncate">{current?.label ?? "Choose…"}</span>
        <IconChevronDown className="text-[var(--color-muted)] shrink-0 ml-2" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/25 z-[80]"
            onClick={() => setOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[90] bg-white rounded-t-3xl pb-safe max-h-[75vh] overflow-y-auto shadow-[0_-8px_32px_rgba(16,16,20,0.12)]">
            <div className="sticky top-0 bg-white pt-2 pb-1">
              <div className="mx-auto w-9 h-1 rounded-full bg-[var(--color-line)] mb-3" />
              {title && (
                <div className="px-5 pb-2 text-[13px] uppercase tracking-wide text-[var(--color-muted)]">
                  {title}
                </div>
              )}
            </div>
            <div className="px-3 pb-3">
              {options.map((o) => {
                const active = o.value === value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={`w-full text-left rounded-xl px-3 py-3 flex items-start gap-3 ${
                      active ? "bg-[var(--color-accent-soft)]" : "active:bg-[var(--color-surface)]"
                    }`}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{o.label}</span>
                        {o.badge && (
                          <span className="text-[11px] text-[var(--color-accent-ink)] bg-white border border-green-200 rounded-full px-2 py-0.5">
                            {o.badge}
                          </span>
                        )}
                      </span>
                      {o.note && (
                        <span className="block text-[13px] text-[var(--color-muted)] mt-0.5">
                          {o.note}
                        </span>
                      )}
                    </span>
                    {active && (
                      <IconCheck className="text-[var(--color-accent)] shrink-0 mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-xl bg-[var(--color-surface-2)] p-1 w-full">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 px-3 py-2 rounded-lg text-[14px] transition-colors ${
            value === o.value
              ? "bg-white text-[var(--color-ink)] font-medium shadow-[0_1px_2px_rgba(16,16,20,0.08)]"
              : "text-[var(--color-muted)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Height entry that swaps between a single cm field and paired ft/in fields.
 * Always reports centimetres upward — the risk engine never sees inches.
 */
export function HeightInput({
  cm,
  onChange,
  system,
  onSystemChange,
}: {
  cm: number | null;
  onChange: (cm: number | null) => void;
  system: UnitSystem;
  onSystemChange?: (s: UnitSystem) => void;
}) {
  const parts = cm == null ? { ft: null, inch: null } : cmToFtIn(cm);
  const [ft, setFt] = useState<number | null>(parts.ft);
  const [inch, setInch] = useState<number | null>(parts.inch);

  // Re-sync when the underlying value changes from elsewhere (e.g. unit switch).
  useEffect(() => {
    if (cm == null) {
      setFt(null);
      setInch(null);
      return;
    }
    const p = cmToFtIn(cm);
    setFt(p.ft);
    setInch(p.inch);
  }, [cm]);

  const swap = onSystemChange
    ? () => onSystemChange(system === "metric" ? "imperial" : "metric")
    : undefined;

  if (system === "metric") {
    return (
      <NumberInput
        value={cm}
        onChange={onChange}
        suffix="cm"
        onSuffixTap={swap}
        placeholder="175"
      />
    );
  }

  function emit(nextFt: number | null, nextIn: number | null) {
    if (nextFt == null && nextIn == null) return onChange(null);
    onChange(round(ftInToCm(nextFt ?? 0, nextIn ?? 0), 1));
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <NumberInput
        value={ft}
        onChange={(v) => {
          setFt(v);
          emit(v, inch);
        }}
        suffix="ft"
        onSuffixTap={swap}
        placeholder="5"
      />
      <NumberInput
        value={inch}
        onChange={(v) => {
          setInch(v);
          emit(ft, v);
        }}
        suffix="in"
        onSuffixTap={swap}
        placeholder="9"
      />
    </div>
  );
}

/** Mass entry in kg or lb; always reports kilograms upward. */
export function WeightInput({
  kg,
  onChange,
  system,
  onSystemChange,
  placeholder,
}: {
  kg: number | null;
  onChange: (kg: number | null) => void;
  system: UnitSystem;
  onSystemChange?: (s: UnitSystem) => void;
  placeholder?: string;
}) {
  const display = kg == null ? null : system === "metric" ? round(kg, 1) : round(kgToLb(kg), 1);
  return (
    <NumberInput
      value={display}
      onChange={(v) =>
        onChange(v == null ? null : system === "metric" ? v : round(lbToKg(v), 2))
      }
      suffix={weightUnit(system)}
      onSuffixTap={
        onSystemChange
          ? () => onSystemChange(system === "metric" ? "imperial" : "metric")
          : undefined
      }
      placeholder={placeholder}
    />
  );
}

/** Generic length (waist) in cm or in; always reports centimetres upward. */
export function LengthInput({
  cm,
  onChange,
  system,
  onSystemChange,
  placeholder,
}: {
  cm: number | null;
  onChange: (cm: number | null) => void;
  system: UnitSystem;
  onSystemChange?: (s: UnitSystem) => void;
  placeholder?: string;
}) {
  const display = cm == null ? null : system === "metric" ? round(cm, 1) : round(cmToIn(cm), 1);
  return (
    <NumberInput
      value={display}
      onChange={(v) => onChange(v == null ? null : system === "metric" ? v : round(inToCm(v), 1))}
      suffix={lengthUnit(system)}
      onSuffixTap={
        onSystemChange
          ? () => onSystemChange(system === "metric" ? "imperial" : "metric")
          : undefined
      }
      placeholder={placeholder}
    />
  );
}
