import { readFile } from 'node:fs/promises';
import { refToScrap } from '../currency.ts';
import type { Listing, MarketDataSource } from '../types.ts';

interface FixtureListing {
  intent: 'buy' | 'sell';
  steamId: string;
  keys?: number;
  /** Metal in ref notation, e.g. 52.11 */
  metal?: number;
  automatic?: boolean;
  /** Listing age in seconds at load time. */
  ageS?: number;
}

/** Static market loaded from a JSON fixture: { "<sku>": FixtureListing[] }. For dry runs and demos. */
export class MockSource implements MarketDataSource {
  readonly #path: string;

  constructor(path: string) {
    this.#path = path;
  }

  async getListings(sku: string): Promise<Listing[]> {
    const data = JSON.parse(await readFile(this.#path, 'utf8')) as Record<string, FixtureListing[]>;
    const now = Math.floor(Date.now() / 1000);
    return (data[sku] ?? []).map((l) => ({
      sku,
      intent: l.intent,
      steamId: l.steamId,
      price: { keys: l.keys ?? 0, scrap: refToScrap(l.metal ?? 0) },
      automatic: l.automatic ?? true,
      updatedAt: now - (l.ageS ?? 0),
    }));
  }
}
