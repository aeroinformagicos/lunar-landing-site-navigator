// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// «Find the best site» from outside the map (T-90, proposal 9): the request switches to the Map tab and
// the best-site tool opens unfolded when it mounts there. Module state: one pending request, for 1.5 s.
import { useAppStore } from '../../state/store';

let pending = false;

export function requestBestSite(): void {
  pending = true;
  // Read (not consumed) by the tool as it mounts; a strict-mode double render reads the same value.
  setTimeout(() => {
    pending = false;
  }, 1500);
  const s = useAppStore.getState();
  if (s.comparing) s.setComparing(false);
  s.setTab('map');
}

/** True just after `requestBestSite`: the tool starts open (and focused). */
export function takeBestSiteRequest(): boolean {
  return pending;
}
