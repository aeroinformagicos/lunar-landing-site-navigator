// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// «Power & comms» view of the bottom strip (T-93, D-123): the visibility of the mission read as energy
// from a reference panel, a battery for the longest night and hours of direct link with the Earth. A
// labelled, simplified estimate with its assumptions in sight and editable; it reuses the visibility
// results (core/power.ts) and changes no figure of the «Sun & Earth visibility» view.
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { DEFAULT_POWER, powerComms, type PanelOrientation, type PowerAssumptions } from '../../core/power';
import { t, type TextKey } from '../../i18n/t';
import { create } from 'zustand';
import { Dialog } from '../common/Dialog';
import { useActive } from '../shell/useActive';

export type FiguresView = 'visibility' | 'power';

interface PowerUi {
  view: FiguresView;
  assumptions: PowerAssumptions;
  setView(v: FiguresView): void;
  setAssumptions(a: Partial<PowerAssumptions>): void;
  reset(): void;
}

/** Presentation state only (not in the store of the scenarios nor in the shared link). */
export const usePowerUi = create<PowerUi>((set) => ({
  view: 'visibility',
  assumptions: { ...DEFAULT_POWER },
  setView: (view) => set({ view }),
  setAssumptions: (a) => set((s) => ({ assumptions: { ...s.assumptions, ...a } })),
  reset: () => set({ assumptions: { ...DEFAULT_POWER } }),
}));

const kwh = (wh: number) => (wh >= 100_000 ? (wh / 1000).toFixed(0) : wh >= 10_000 ? (wh / 1000).toFixed(1) : (wh / 1000).toFixed(2));
const hours = (h: number) => (h >= 100 ? h.toFixed(0) : h.toFixed(1));

/** The switch between the two readings of the figures (`Sun & Earth visibility` / `Power & comms`). */
export function FiguresSwitch() {
  const view = usePowerUi((s) => s.view);
  const setView = usePowerUi((s) => s.setView);
  const opts: [FiguresView, TextKey][] = [
    ['visibility', 'power.view_visibility'],
    ['power', 'power.view_power'],
  ];
  return (
    <div className="v2-figswitch" role="group" aria-label={t('power.switch_label')}>
      {opts.map(([v, key]) => (
        <button key={v} type="button" className="pill pill--small v2-figswitch__opt" aria-pressed={view === v} onClick={() => setView(v)}>
          {t(key)}
        </button>
      ))}
    </div>
  );
}

function Fig({ value, unit, label, sub, tone, id }: { value: string; unit: string; label: string; sub: string; tone: 'sun' | 'earth' | 'plain'; id: string }) {
  return (
    <div className={`v2-fig v2-fig--${tone} v2-power__fig`} data-testid={`power-${id}`}>
      <p className="v2-fig__value">
        {value}
        <span className="v2-fig__unit"> {unit}</span>
      </p>
      <p className="v2-fig__label">
        <span>{label}</span>
      </p>
      <p className="v2-power__sub">{sub}</p>
    </div>
  );
}

export function PowerFigures() {
  const { resource } = useActive();
  const a = usePowerUi((s) => s.assumptions);
  const data = resource.status === 'ready' ? resource.data : null;
  const result = useMemo(() => {
    if (!data) return null;
    const { model, mission } = data;
    const m = mission.metrics;
    try {
      return powerComms(model.table, model.frame, model.mask, m.tA, m.tB, m.longestNightH, a);
    } catch {
      return null;
    }
  }, [data, a]);
  if (!data || !result) return <div className="v2-figs v2-figs--loading" aria-busy="true" />;
  const night = data.mission.metrics.longestNightH;
  return (
    <div className="v2-figs v2-power" role="group" aria-label={t('power.figures_label')}>
      <Fig id="energy" tone="sun" value={kwh(result.energyPerDayWh)} unit="kWh/day" label={t('power.energy')} sub={t('power.energy_sub', { total: kwh(result.energyWh), peak: result.peakW.toFixed(0) })} />
      <Fig id="battery" tone="plain" value={kwh(result.batteryWh)} unit="kWh" label={t('power.battery')} sub={t('power.battery_sub', { night: hours(night), load: String(a.loadW) })} />
      <Fig
        id="link"
        tone="earth"
        value={hours(result.linkHours)}
        unit="h"
        label={t('power.link', { min: String(a.minEarthDeg) })}
        sub={t('power.link_sub', { pct: result.linkPct.toFixed(0), gap: hours(result.longestGapH) })}
      />
    </div>
  );
}

function NumberField({ id, label, value, min, max, step, onChange }: { id: string; label: string; value: number; min: number; max: number; step: number; onChange(v: number): void }) {
  return (
    <label className="v2-power__field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(v) && v >= min && v <= max) onChange(v);
        }}
      />
    </label>
  );
}

/** Estimate notice and the assumptions, always in sight; `Edit assumptions` opens the fields in a dialog
 *  (a form inside the bottom strip pushed it into the header on short windows). */
export function PowerAssumptionsBlock() {
  const a = usePowerUi((s) => s.assumptions);
  const setA = usePowerUi((s) => s.setAssumptions);
  const reset = usePowerUi((s) => s.reset);
  const [open, setOpen] = useState(false);
  const orient = t(a.orientation === 'vertical_tracking' ? 'power.orient_vertical' : 'power.orient_horizontal');
  return (
    <div className="v2-power__assume">
      <p className="v2-power__note" role="note">
        <span aria-hidden="true">⚠ </span>
        {t('power.notice', { area: String(a.areaM2), eff: (a.efficiency * 100).toFixed(1), orient, load: String(a.loadW), min: String(a.minEarthDeg) })}{' '}
        <button type="button" className="v2-link" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          {t('power.edit')}
        </button>
      </p>
      {open &&
        createPortal(
        <Dialog title={t('power.assumptions')} onClose={() => setOpen(false)}>
        <fieldset id="power-assumptions" className="v2-power__form">
          <legend className="visually-hidden">{t('power.assumptions')}</legend>
          <NumberField id="pw-eff" label={t('power.f_eff')} value={Number((a.efficiency * 100).toFixed(1))} min={1} max={100} step={0.1} onChange={(v) => setA({ efficiency: v / 100 })} />
          <NumberField id="pw-area" label={t('power.f_area')} value={a.areaM2} min={0.01} max={1000} step={0.1} onChange={(v) => setA({ areaM2: v })} />
          <label className="v2-power__field" htmlFor="pw-orient">
            <span>{t('power.f_orient')}</span>
            <select id="pw-orient" value={a.orientation} onChange={(e) => setA({ orientation: e.target.value as PanelOrientation })}>
              <option value="vertical_tracking">{t('power.orient_vertical')}</option>
              <option value="horizontal">{t('power.orient_horizontal')}</option>
            </select>
          </label>
          <NumberField id="pw-load" label={t('power.f_load')} value={a.loadW} min={0} max={100_000} step={1} onChange={(v) => setA({ loadW: v })} />
          <NumberField id="pw-min" label={t('power.f_min')} value={a.minEarthDeg} min={0} max={30} step={0.5} onChange={(v) => setA({ minEarthDeg: v })} />
          <button type="button" className="btn btn--ghost" onClick={reset}>
            {t('power.reset')}
          </button>
          <p className="v2-power__sources">{t('power.sources')}</p>
        </fieldset>
        </Dialog>,
        // Out of the bottom strip's stacking context, so the dialog covers the header and the pills.
        document.querySelector('.v2') ?? document.body,
      )}
    </div>
  );
}
