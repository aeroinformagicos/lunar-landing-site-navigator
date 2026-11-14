// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Visually hidden data tables of events and windows (10_interfaz.md §12). Rendered once in the
// right panel, so every chart (panorama, timeline, cross-section, map) can point its
// `aria-describedby` at `#chart-data` whatever tab is open.
import { t } from '../../i18n/t';
import { formatHours, formatUtc } from '../common/format';
import { eventWord } from './derive';
import type { MissionResult } from './useMission';

export const CHART_DATA_ID = 'chart-data';
/** What every chart's `aria-describedby` lists: the plain summary and these tables. */
export const CHART_DESCRIBEDBY = `plain-summary ${CHART_DATA_ID}`;

export function ChartData({ mission }: { mission: MissionResult }) {
  const { metrics, eclipse } = mission;
  const windows: [string, typeof metrics.windows.sun][] = [
    [t('timeline.sun'), metrics.windows.sun],
    [t('timeline.earth'), metrics.windows.earth],
    [t('timeline.both'), metrics.windows.both],
  ];
  return (
    <div id={CHART_DATA_ID} className="visually-hidden">
      <h3>{t('timeline.events')}</h3>
      <table>
        <caption>{t('data.events_caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('data.event')}</th>
            <th scope="col">{t('data.time')}</th>
          </tr>
        </thead>
        {eclipse.events.length > 0 && (
          <tbody data-testid="eclipse-events">
            {eclipse.events.map((e) => (
              <tr key={`${e.kind}-${e.tUnix}`}>
                <th scope="row">{eventWord(e.kind)}</th>
                <td>{formatUtc(e.tUnix)}</td>
              </tr>
            ))}
          </tbody>
        )}
        <tbody>
          {metrics.events.length === 0 ? (
            <tr>
              <td colSpan={2}>{t('timeline.no_events')}</td>
            </tr>
          ) : (
            metrics.events.map((e) => (
              <tr key={`${e.kind}-${e.tUnix}`}>
                <th scope="row">{eventWord(e.kind)}</th>
                <td>{formatUtc(e.tUnix)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <table>
        <caption>{t('data.windows_caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('data.body')}</th>
            <th scope="col">{t('data.start')}</th>
            <th scope="col">{t('data.end')}</th>
            <th scope="col">{t('data.duration')}</th>
          </tr>
        </thead>
        <tbody>
          {windows.flatMap(([what, ws]) =>
            ws.map((w) => (
              <tr key={`${what}-${w.startUnix}`}>
                <th scope="row">{what}</th>
                <td>{formatUtc(w.startUnix)}</td>
                <td>{formatUtc(w.endUnix)}</td>
                <td>{formatHours((w.endUnix - w.startUnix) / 3600)}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}
