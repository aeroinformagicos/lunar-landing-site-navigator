// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Opening a left panel of the v2 shell from elsewhere (T-90, proposal 4: `Change requirements` in the
// Now panel opens Setup on its Requirements). A window event, so the panels need no new props.
export type LeftPanel = 'sites' | 'setup';

const EVENT = 'llsn:open-left-panel';

export interface OpenLeftPanel {
  which: LeftPanel;
  /** CSS selector of the element to focus once the panel is open. */
  focus?: string;
}

export function openLeftPanel(detail: OpenLeftPanel): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<OpenLeftPanel>(EVENT, { detail }));
}

/** Subscribes to `openLeftPanel`; returns the unsubscribe function. */
export function onOpenLeftPanel(cb: (d: OpenLeftPanel) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<OpenLeftPanel>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

/** The first requirement control of the Setup panel. */
export const REQUIREMENTS_FOCUS = 'section[aria-labelledby="v2-req-title"] input';
