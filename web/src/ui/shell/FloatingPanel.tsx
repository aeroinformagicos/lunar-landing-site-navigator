// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Floating, foldable panel of the v2 shell (15_interfaz_v2.md §6.4): folded, a tab on its side with
// a short summary; open, a translucent card. `Esc` inside folds it and returns the focus to its tab.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { t } from '../../i18n/t';
import { readPanelOpen, writePanelOpen } from './panelState';

export interface FloatingPanelProps {
  id: string;
  title: string;
  side: 'left' | 'right';
  defaultOpen: boolean;
  /** Text of the folded tab (e.g. `Setup · 1 Aug 2027 · 14 d`). */
  summary?: string;
  icon?: ReactNode;
  className?: string;
  /** Opens the panel from outside (e.g. `Add scenario` opens Sites). Changing it opens the panel. */
  openSignal?: number;
  /** Controlled mode (the left panels work as an accordion): the shell owns `open`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

export function FloatingPanel({ id, title, side, defaultOpen, summary, icon, className, openSignal, open: controlled, onOpenChange, children }: FloatingPanelProps) {
  const [own, setOwn] = useState(() => readPanelOpen(id, defaultOpen));
  const open = controlled ?? own;
  const setOpenState = (v: boolean) => (onOpenChange ? onOpenChange(v) : setOwn(v));
  const bodyId = useId();
  const tabRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);

  const setOpen = (v: boolean) => {
    setOpenState(v);
    if (controlled === undefined) writePanelOpen(id, v);
    refocus.current = true;
  };

  useEffect(() => {
    if (openSignal) setOpenState(true);
    // Only a new signal opens the panel.
  }, [openSignal]);

  // After folding or unfolding, the focus goes to the button that now controls the panel.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    tabRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button
        ref={tabRef}
        type="button"
        className={`fp-tab fp-tab--${side}`}
        aria-expanded={false}
        aria-controls={bodyId}
        aria-label={t('panel.expand', { name: summary ?? title })}
        onClick={() => setOpen(true)}
        data-panel={id}
      >
        {icon}
        <span>{summary ?? title}</span>
      </button>
    );
  }
  return (
    <section
      id={bodyId}
      className={`fp fp--${side}${className ? ` ${className}` : ''}`}
      aria-labelledby={`${bodyId}-title`}
      data-panel={id}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <div className="fp__head">
        <h2 id={`${bodyId}-title`} className="fp__title">
          {icon}
          {title}
        </h2>
        <button
          ref={tabRef}
          type="button"
          className="fp__fold"
          aria-expanded={true}
          aria-controls={bodyId}
          aria-label={t('panel.collapse', { name: title })}
          onClick={() => setOpen(false)}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d={side === 'right' ? 'M5 2l5 5-5 5' : 'M9 2L4 7l5 5'} fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      </div>
      <div className="fp__body">{children}</div>
    </section>
  );
}
