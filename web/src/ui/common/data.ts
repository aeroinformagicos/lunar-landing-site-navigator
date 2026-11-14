// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Boot data (config, manifest, sites) shared with the views once loaded.
import { createContext, useContext } from 'react';
import type { BootData, Site } from '../../core/types';

export const BootContext = createContext<BootData | null>(null);

export function useBoot(): BootData {
  const boot = useContext(BootContext);
  if (!boot) throw new Error('useBoot outside BootContext');
  return boot;
}

export function useSite(siteRef: string): Site | undefined {
  return useBoot().sites.sites.find((s) => s.id === siteRef);
}
