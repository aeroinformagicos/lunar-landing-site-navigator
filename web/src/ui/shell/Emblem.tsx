// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Lunar Sightline emblem (15_interfaz_v2.md §6.1, D-104): orbital reticle, lunar curvature and solar
// node, with the geometry of the Open Horizon mockup. Decorative: the link around it has the name.
export function Emblem({ size = 48 }: { size?: number }) {
  return (
    <svg className="emblem" width={size} height={size} viewBox="0 0 44 44" aria-hidden="true" focusable="false">
      <circle cx="22" cy="22" r="15" fill="none" stroke="var(--c-muted)" strokeWidth="1" />
      <path d="M22 4v6M22 34v6M4 22h6M34 22h6" stroke="var(--c-muted)" strokeWidth="1" />
      <path d="M6 27 Q22 17 38 27" fill="none" stroke="var(--c-text)" strokeWidth="1.6" />
      <ellipse cx="22" cy="24" rx="19" ry="7" transform="rotate(-18 22 24)" fill="none" stroke="var(--c-earth)" strokeWidth="1.4" />
      <circle cx="30" cy="24" r="3" fill="var(--c-sun)" />
    </svg>
  );
}
