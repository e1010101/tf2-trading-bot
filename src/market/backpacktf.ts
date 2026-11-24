import { refToScrap } from '../currency.ts';
import type { Listing, MarketDataSource } from '../types.ts';

/**
 * backpack.tf classifieds snapshot client.
 *
 * NOTE: written from the documented snapshot shape but not yet exercised against the live
 * API. Check the endpoint, the `sku` parameter (the API may want the item name instead)
 * and rate limits against https://backpack.tf/api/index.html before relying on it.
 */

interface SnapshotListing {
  steamid: string;
  intent: 'buy' | 'sell';
  timestamp: number;
  bump?: number;
  currencies: { metal?: number; keys?: number };
  userAgent?: { client: string; lastPulse: number };
}

interface SnapshotResponse {
  listings?: SnapshotListing[];
}

export class BackpackTfSource implements MarketDataSource {
  readonly #token: string;
  readonly #baseUrl: string;

  constructor(token: string, baseUrl = 'https://backpack.tf/api') {
    if (!token) throw new Error('BPTF_TOKEN is required for DATA_SOURCE=backpacktf');
    this.#token = token;
    this.#baseUrl = baseUrl;
  }

  async getListings(sku: string): Promise<Listing[]> {
    const url = new URL(`${this.#baseUrl}/classifieds/listings/snapshot`);
    url.searchParams.set('appid', '440');
    url.searchParams.set('sku', sku);
    url.searchParams.set('token', this.#token);

    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`backpack.tf snapshot ${sku}: HTTP ${res.status}`);
    const body = (await res.json()) as SnapshotResponse;

    return (body.listings ?? []).map((l) => ({
      sku,
      intent: l.intent,
      steamId: l.steamid,
      price: { keys: l.currencies.keys ?? 0, scrap: refToScrap(l.currencies.metal ?? 0) },
      automatic: l.userAgent !== undefined,
      updatedAt: l.bump ?? l.timestamp,
    }));
  }
}
