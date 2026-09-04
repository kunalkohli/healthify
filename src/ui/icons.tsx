/**
 * Inline SVG icons.
 *
 * These replace the Unicode glyphs the tab bar used to use. Characters like
 * U+25CD aren't present in the iOS system font, so they rendered as tofu boxes
 * — and inherited the active tab's colour, producing a green square.
 */
type IconProps = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function IconToday({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />
    </svg>
  );
}

export function IconRisks({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M12 3.5 21 19H3z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.75" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconCoach({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M20 14.5a2.5 2.5 0 0 1-2.5 2.5H9l-4 3.5v-3.5H6.5A2.5 2.5 0 0 1 4 14.5v-8A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5z" />
    </svg>
  );
}

export function IconYou({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

export function IconSend({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={2} aria-hidden="true">
      <path d="M12 19V5" />
      <path d="m5.5 11.5 6.5-6.5 6.5 6.5" />
    </svg>
  );
}

export function IconMic({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

export function IconStop({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconCheck({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={2.25} aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

export function IconChevronDown({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconChevron({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}
