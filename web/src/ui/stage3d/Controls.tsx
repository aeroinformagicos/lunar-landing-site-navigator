// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// The only panel of the 3D view (16_vista_3d.md §10.1): camera mode, Go to, Recenter, Overlay (§9),
// help, compass, scale bar and readout (§7, §8.6), the illustrative-shading notice and the relief line
// (§6.7, §2.1), the layer legend, terrain loading and error states. Compass, scale, readout and the
// «beyond the mapped area» line are written by the render loop through the refs (no React render per
// frame).
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { TextKey } from '../../i18n/t';
import { t } from '../../i18n/t';
import type { MapLayer } from '../../state/store';
import { Button } from '../common/Button';
import type { CameraMode } from './navigation';
import { CAMERA_MODES } from './navigation';
import type { ReliefLevel } from './scenePlan';
import { STAGE3D_SHORTCUTS } from './shortcuts';

export interface GoToItem {
  key: string;
  label: string;
  onSelect(): void;
}

/** The Overlay control and its legend (§9); absent outside the polar scene. */
export interface OverlayControl {
  choices: { layer: MapLayer; label: string }[];
  current: MapLayer;
  onPick(layer: MapLayer): void;
  /** Legend of the layer on show. */
  legend: {
    ramp: [number, number, number][];
    periodLabel: string;
    planB: boolean;
    status: 'idle' | 'loading' | 'ready' | 'error';
    onRetry(): void;
  } | null;
}

export interface LiveRefs {
  compass: RefObject<SVGGElement | null>;
  earthSide: RefObject<SVGGElement | null>;
  scaleBar: RefObject<HTMLSpanElement | null>;
  scaleText: RefObject<HTMLSpanElement | null>;
  readout: RefObject<HTMLSpanElement | null>;
  skyNote: RefObject<HTMLParagraphElement | null>;
  beyond: RefObject<HTMLParagraphElement | null>;
}

export interface ControlsProps {
  relief: { text: string; warn: boolean; level: ReliefLevel };
  overlay: OverlayControl | null;
  terrain: 'loading' | 'ready' | 'error' | 'none';
  onRetry(): void;
  onRecenter(): void;
  onNorthUp(): void;
  mode: CameraMode;
  onMode(m: CameraMode): void;
  goTo: GoToItem[];
  message: string | null;
  fps: string | null;
  live: LiveRefs;
  polar: boolean;
}

const OPEN_KEY = 'llsn.stage3d.controls';
const MODE_TEXT: Record<CameraMode, TextKey> = { orbit: 'stage3d.orbit', fly: 'stage3d.fly', ground: 'stage3d.ground' };

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== '0';
  } catch {
    return true;
  }
}

export function Controls(p: ControlsProps) {
  const [open, setOpen] = useState(readOpen);
  const [help, setHelp] = useState(false);
  const [menu, setMenu] = useState(false);
  const [layerMenu, setLayerMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, open ? '1' : '0');
    } catch {
      /* private mode: the choice is not remembered */
    }
  }, [open]);
  useEffect(() => {
    if (!help && !menu && !layerMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setHelp(false);
      setMenu(false);
      setLayerMenu(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [help, menu, layerMenu]);
  useEffect(() => {
    if (menu) menuRef.current?.querySelector('button')?.focus();
  }, [menu]);
  useEffect(() => {
    if (layerMenu) layerRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus();
  }, [layerMenu]);
  // Outside the polar scene the Overlay control goes away, and so does its menu.
  useEffect(() => {
    if (!p.overlay) setLayerMenu(false);
  }, [p.overlay]);

  if (!open) {
    return (
      <div className="stage3d__controls stage3d__controls--closed">
        <Button variant="secondary" onClick={() => setOpen(true)} aria-expanded={false}>
          {t('stage3d.show_controls')}
        </Button>
      </div>
    );
  }
  const shortcuts = STAGE3D_SHORTCUTS.filter((s) => s.modes.includes(p.mode));
  return (
    <section className="stage3d__controls" aria-label={t('stage3d.controls')}>
      <div className="stage3d__row">
        <div className="stage3d__modes" role="group" aria-label={t('stage3d.mode')}>
          {CAMERA_MODES.map((m) => (
            <Button key={m} variant="secondary" aria-pressed={p.mode === m} onClick={() => p.onMode(m)}>
              {t(MODE_TEXT[m])}
            </Button>
          ))}
        </div>
        <Button variant="ghost" aria-label={t('stage3d.hide_controls')} aria-expanded onClick={() => setOpen(false)}>
          ✕
        </Button>
      </div>
      <div className="stage3d__row">
        <div className="stage3d__menu-wrap">
          <Button variant="secondary" aria-expanded={menu} aria-haspopup="true" onClick={() => setMenu((m) => !m)}>
            {t('stage3d.goto')}
          </Button>
          {menu && (
            <div ref={menuRef} className="stage3d__menu" role="group" aria-label={t('stage3d.goto_list')}>
              {p.goTo.map((g) => (
                <Button
                  key={g.key}
                  variant="ghost"
                  onClick={() => {
                    setMenu(false);
                    g.onSelect();
                  }}
                >
                  {g.label}
                </Button>
              ))}
            </div>
          )}
        </div>
        <Button variant="secondary" onClick={p.onRecenter}>
          {t('stage3d.recenter')}
        </Button>
        {p.overlay && (
          <div className="stage3d__menu-wrap">
            <Button
              variant="secondary"
              aria-expanded={layerMenu}
              aria-haspopup="true"
              aria-label={`${t('stage3d.overlay')}: ${p.overlay.choices.find((c) => c.layer === p.overlay!.current)?.label ?? ''}`}
              onClick={() => setLayerMenu((m) => !m)}
            >
              {t('stage3d.overlay')}
            </Button>
            {layerMenu && (
              <div ref={layerRef} className="stage3d__menu" role="group" aria-label={t('stage3d.overlay_list')}>
                {p.overlay.choices.map((c) => (
                  <Button
                    key={c.layer}
                    variant="ghost"
                    aria-pressed={p.overlay!.current === c.layer}
                    onClick={() => {
                      setLayerMenu(false);
                      p.overlay!.onPick(c.layer);
                    }}
                  >
                    {c.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
        <Button variant="secondary" aria-label={t('stage3d.help')} aria-expanded={help} onClick={() => setHelp((h) => !h)}>
          ?
        </Button>
      </div>
      <div className="stage3d__row stage3d__row--live">
        <button type="button" className="stage3d__compass" aria-label={t('stage3d.north_up')} onClick={p.onNorthUp}>
          <svg aria-hidden="true" width="40" height="40" viewBox="-20 -20 40 40">
            <circle r="18" fill="none" stroke="currentColor" strokeOpacity="0.5" />
            <g ref={p.live.compass}>
              <path d="M0 -15 L4 0 L0 -3 L-4 0 Z" fill="currentColor" />
              <text y="-5" fontSize="8" textAnchor="middle" fill="currentColor" transform="translate(0 -7)">
                N
              </text>
            </g>
            {p.polar && (
              <g ref={p.live.earthSide}>
                <path d="M0 -17 L0 -12" stroke="var(--c-earth, #38bdf8)" strokeWidth="2" />
              </g>
            )}
          </svg>
        </button>
        <span className="stage3d__scale" aria-hidden="true">
          <span ref={p.live.scaleBar} className="stage3d__scale-bar" />
          <span ref={p.live.scaleText} className="stage3d__mono" />
        </span>
        <span ref={p.live.readout} className="stage3d__readout stage3d__mono" />
      </div>
      {p.message && (
        <p className="stage3d__status" role="status">
          {p.message}
        </p>
      )}
      {p.terrain === 'loading' && (
        <p className="stage3d__status" role="status">
          {t('stage3d.loading_terrain')}
        </p>
      )}
      {p.terrain === 'error' && (
        <p className="stage3d__status stage3d__status--error" role="status">
          {t('stage3d.terrain_error')}{' '}
          <Button variant="ghost" onClick={p.onRetry}>
            {t('common.retry')}
          </Button>
        </p>
      )}
      {p.overlay?.legend && <Legend legend={p.overlay.legend} layer={p.overlay.choices.find((c) => c.layer === p.overlay!.current)?.label ?? ''} />}
      <p ref={p.live.skyNote} className="stage3d__note" hidden />
      <p className={`stage3d__relief${p.relief.level === 'warn' ? ' stage3d__relief--warn' : p.relief.level === 'red' ? ' stage3d__relief--red' : ''}`}>
        {p.relief.warn && <span aria-hidden="true">▲ </span>}
        {p.relief.text}
      </p>
      {p.relief.level === 'red' && <p className="stage3d__note stage3d__relief--red">{t('relief.smooth_warning')}</p>}
      <p ref={p.live.beyond} className="stage3d__note" hidden>
        {t('stage3d.beyond')}
      </p>
      <p className="stage3d__note">{t('stage3d.disclaimer')}</p>
      {p.fps && <p className="stage3d__note">{p.fps}</p>}
      {help && (
        <div className="stage3d__help" role="region" aria-label={t('stage3d.help_title')}>
          <div className="stage3d__help-head">
            <h2>{t('stage3d.help_title')}</h2>
            <Button variant="ghost" aria-label={t('common.close')} onClick={() => setHelp(false)}>
              ✕
            </Button>
          </div>
          <dl>
            {shortcuts.map((s) => (
              <div key={s.keys + s.action}>
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

/** Legend of the projected layer (§9): the map's ramp, its texts and the period. */
function Legend({ legend, layer }: { legend: NonNullable<OverlayControl['legend']>; layer: string }) {
  return (
    <div className="stage3d__legend" role="group" aria-label={t('stage3d.overlay_shown', { layer })}>
      {legend.planB && <p className="stage3d__note">{t('map.plan_b')}</p>}
      <div className="stage3d__ramp" aria-hidden="true">
        {legend.ramp.map((c, k) => (
          <span key={k} style={{ background: `rgb(${c.join(',')})` }} />
        ))}
      </div>
      <p className="stage3d__note">
        <span className="stage3d__mono">0</span> {t('map.legend')} <span className="stage3d__mono">100</span>
        {legend.status === 'loading' && <em> · {t('map.layer_loading')}</em>}
      </p>
      {legend.status === 'error' && (
        <p className="stage3d__status stage3d__status--error" role="status">
          {t('stage3d.overlay_error')}{' '}
          <Button variant="ghost" onClick={legend.onRetry}>
            {t('common.retry')}
          </Button>
        </p>
      )}
      <p className="stage3d__note">{t('map.criterion')}</p>
      <p className="stage3d__note">
        {t('stage3d.overlay_period', { period: legend.periodLabel })} · {legend.planB ? t('map.source_nasa') : t('map.source_computed')}
      </p>
    </div>
  );
}
