// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Modal dialog (10_interfaz.md §5, §12): `role="dialog"`, focus trapped inside, `Esc` closes,
// focus returns to the element that opened it. The only focus trap of the app.
import { useEffect, useRef, type ReactNode } from 'react';
import { t } from '../../i18n/t';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function Dialog({ title, onClose, children, className }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const box = ref.current;
    const first = box?.querySelector<HTMLElement>('[autofocus], input') ?? box?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => opener?.focus?.();
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={['dialog', className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onKeyDown={onKeyDown}
      >
        <header className="dialog__header">
          <h2 id="dialog-title">{title}</h2>
          <button type="button" className="dialog__close" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
