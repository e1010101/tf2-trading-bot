import { refToScrap } from './currency.ts';
import { KEY_SKU } from './types.ts';

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${raw}"`);
  return n;
}

export interface Config {
  dataSource: 'mock' | 'backpacktf';
  bptfToken: string;
  steamId?: string;
  watchlist: string[];
  minProfitScrap: number;
  maxTradeCostScrap: number;
  maxListingAgeS: number;
  pollIntervalS: number;
  dryRun: boolean;
  paperStart: { keys: number; scrap: number };
}

export function loadConfig(): Config {
  const dataSource = process.env.DATA_SOURCE || 'mock';
  if (dataSource !== 'mock' && dataSource !== 'backpacktf') {
    throw new Error(`DATA_SOURCE must be "mock" or "backpacktf", got "${dataSource}"`);
  }
  const watchlist = (process.env.WATCHLIST || KEY_SKU)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    dataSource,
    bptfToken: process.env.BPTF_TOKEN ?? '',
    steamId: process.env.STEAM_ID || undefined,
    watchlist,
    minProfitScrap: num('MIN_PROFIT_SCRAP', 1),
    maxTradeCostScrap: refToScrap(num('MAX_TRADE_COST_REF', 200)),
    maxListingAgeS: num('MAX_LISTING_AGE_S', 1800),
    pollIntervalS: num('POLL_INTERVAL_S', 60),
    dryRun: (process.env.DRY_RUN ?? 'true') !== 'false',
    paperStart: { keys: num('PAPER_START_KEYS', 2), scrap: refToScrap(num('PAPER_START_REF', 150)) },
  };
}
