// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// The only panel of the 3D view (16_vista_3d.md §10.1): camera controls bottom right, the
// illustrative-shading notice and the relief line (§6.7), terrain loading and error states.
import { useEffect, useState } from 'react';
import { t } from '../../i18n/t';
import { Button } from '../common/Button';
import { STAGE3D_SHORTCUTS } from './shortcuts';

export interface ControlsProps {
  relief: { text: string; warn: boolean };
  terrain: 'loading' | 'ready' | 'error' | 'none';
  onRetry(): void;
  onRecenter(): void;
  fps: string | null;
}

const OPEN_KEY = 'llsn.stage3d.controls';

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== '0';
  } catch {
    return true;
  }
}

export function Controls({ relief, terrain, onRetry, onRecenter, fps }: ControlsProps) {
  const [open, setOpen] = useState(readOpen);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, open ? '1' : '0');
    } catch {
      /* private mode: the choice is not remembered */
    }
  }, [open]);
  useEffect(() => {
    if (!help) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setHelp(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [help]);

  if (!open) {
    return (
      <div className="stage3d__controls stage3d__controls--closed">
        <Button variant="secondary" onClick={() => setOpen(true)} aria-expanded={false}>
          {t('stage3d.show_controls')}
        </Button>
      </div>
    );
  }
  return (
    <section className="stage3d__controls" aria-label={t('stage3d.controls')}>
      <div className="stage3d__row">
        <Button variant="secondary" onClick={onRecenter}>
          {t('stage3d.recenter')}
        </Button>
        <Button variant="secondary" aria-label={t('stage3d.help')} aria-expanded={help} onClick={() => setHelp((h) => !h)}>
          ?
        </Button>
        <Button variant="ghost" aria-label={t('stage3d.hide_controls')} aria-expanded onClick={() => setOpen(false)}>
          ✕
        </Button>
      </div>
      {terrain === 'loading' && (
        <p className="stage3d__status" role="status">
          {t('stage3d.loading_terrain')}
        </p>
      )}
      {terrain === 'error' && (
        <p className="stage3d__status stage3d__status--error" role="status">
          {t('stage3d.terrain_error')}{' '}
          <Button variant="ghost" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        </p>
      )}
      <p className={`stage3d__relief${relief.warn ? ' stage3d__relief--warn' : ''}`}>
        {relief.warn && <span aria-hidden="true">▲ </span>}
        {relief.text}
      </p>
      <p className="stage3d__note">{t('stage3d.disclaimer')}</p>
      {fps && <p className="stage3d__note">{fps}</p>}
      {help && (
        <div className="stage3d__help" role="region" aria-label={t('stage3d.help_title')}>
          <div className="stage3d__help-head">
            <h2>{t('stage3d.help_title')}</h2>
            <Button variant="ghost" aria-label={t('common.close')} onClick={() => setHelp(false)}>
              ✕
            </Button>
          </div>
          <dl>
            {STAGE3D_SHORTCUTS.map((s) => (
              <div key={s.keys}>
                <dt>{t(s.keys)}</dt>
                <dd>{t(s.action)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
