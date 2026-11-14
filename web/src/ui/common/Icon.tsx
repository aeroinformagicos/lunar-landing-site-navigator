// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Small line icons (T-54) for icon-only buttons; the button carries the accessible name.
const PATHS = {
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
