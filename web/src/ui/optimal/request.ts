// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// «Find the best site» from outside the map (T-90, proposal 9): the request switches to the Map tab and
// the best-site tool opens unfolded when it mounts there. Module state: one pending request, consumed
// by the tool once it has mounted (the map may take several seconds to load its data), and dropped
// after 30 s if the map never mounts, so a stale request does not open the tool later.
import { useAppStore } from '../../state/store';

let pending = false;
let timer: ReturnType<typeof setTimeout> | undefined;

export function requestBestSite(): void {
  pending = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    pending = false;
  }, 30_000);
  const s = useAppStore.getState();
  if (s.comparing) s.setComparing(false);
  s.setTab('map');
}

/** True after `requestBestSite` until the tool consumes it: the tool starts open (and focused). */
export function takeBestSiteRequest(): boolean {
  return pending;
}

/** Called by the tool after it has mounted open; a strict-mode double render read the same value. */
export function consumeBestSiteRequest(): void {
  pending = false;
  if (timer) clearTimeout(timer);
  timer = undefined;
}
