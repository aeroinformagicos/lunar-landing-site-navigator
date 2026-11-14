// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Types of the light-origin contract files the web reads (09_contrato_datos.md §1–§5).

export interface AppConfig {
  data_base_url: string;
  heavy_base_url: string;
}

export interface Manifest {
  contract_version: string;
  generated_utc: string;
  git_commit: string;
  sites: number;
  ephemeris: { file: string; bytes: number; synthetic: boolean };
  has_validation_report: boolean;
}

export interface SourceRef {
  label: string;
  url: string;
}

export type SiteType = 'landing' | 'candidate_region' | 'validation' | 'demo';
export type Relief = 'lola_polar' | 'lola_60s' | 'sldem2015' | 'smooth';
export type ObserverHeight = 2 | 10;

export interface Site {
  id: string;
  name: string;
  short_name: string;
  type: SiteType;
  lat_deg: number;
  lon_deg: number;
  height_m: number | null;
  mission: string | null;
  operator: string | null;
  landing_utc: string | null;
  landing_date: string | null;
  relief: Relief;
  relief_label: string;
  has_mask: boolean;
  has_profile: boolean;
  observer_heights_m: ObserverHeight[];
  replan_candidate: boolean;
  region_id: string | null;
  source: SourceRef;
  note: string;
}

export interface SiteDefaults {
  demo_pair: [string, string];
  demo_landing_utc: string;
  demo_mission_days: number;
}

export interface SitesFile {
  contract_version: string;
  defaults: SiteDefaults;
  sites: Site[];
}

export interface HorizonMask {
  observer_height_m: ObserverHeight;
  el_deg: number[];
  dist_m: number[];
  blk_lat_deg: number[];
  blk_lon_deg: number[];
  blk_height_m: number[];
}

export interface HorizonStats {
  truncated_az: number;
  min_truncation_dist_m: number | null;
  nodata_samples: number;
  empty_az: number;
  grid_usage: Record<string, number>;
  min_el_deg: number;
  max_el_deg: number;
  warning: string | null;
}

export interface HorizonFile {
  contract_version: string;
  site_id: string;
  lat_deg: number;
  lon_deg: number;
  site_height_m: number;
  relief: Relief;
  relief_label: string;
  dem_stack: string[];
  az_step_deg: number;
  n_az: number;
  law: 'full' | 'fast';
  max_dist_m: number;
  masks: HorizonMask[];
  smooth_el_deg: Record<string, number>;
  stats: HorizonStats;
  profile: { file: string; n_bins: number; observer_height_m: number } | null;
}

/** Everything the first screen needs (config + manifest + sites). */
export interface BootData {
  config: AppConfig;
  manifest: Manifest;
  sites: SitesFile;
}

/** Load state of a resource (02_arquitectura.md §8, 10_interfaz.md §9). */
export type ResourceStatus = 'idle' | 'loading' | 'ready' | 'error';

export type Resource<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: Error };
