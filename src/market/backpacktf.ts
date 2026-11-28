import { refToScrap } from '../currency.ts';
import { KEY_SKU } from '../types.ts';
import type { Listing, MarketDataSource } from '../types.ts';

/**
 * backpack.tf classifieds snapshot client.
 *
 * The snapshot endpoint's `sku` parameter takes the item's market name, not a
 * `defindex;quality` SKU, so known SKUs are translated before the request. Unknown
 * SKUs are sent unchanged; add them to SKU_NAMES once you know their names.
 */
export const SKU_NAMES: Record<string, string> = {
  [KEY_SKU]: 'Mann Co. Supply Crate Key',
};

/**
 * TF2 attribute defindexes that make an item a distinct variant. From the TF2 item schema as
 * best known; extend if a variant slips through (the report's outsized-profit skips will show it).
 */
const SPECIAL_ATTRIBUTES = new Set([
  134, // unusual particle effect
  142, // paint colour
  261, // paint colour (team 2)
  380, 382, 384, // strange parts
  1004, 1005, 1006, 1007, 1008, 1009, // halloween spells
  2013, 2014, 2025, // killstreaker, sheen, killstreak tier
  2027, // australium
]);

interface SnapshotListing {
  steamid: string;
  /** Strings on current responses; 0 = buy, 1 = sell on older ones. */
  intent: 'buy' | 'sell' | 0 | 1;
  timestamp: number;
  bump?: number;
  currencies?: { metal?: number; keys?: number };
  userAgent?: { client?: string; lastPulse?: number };
  item?: { id?: string | number; attributes?: Array<{ defindex?: number }> };
}

interface SnapshotResponse {
  listings?: SnapshotListing[];
}

function parseIntent(v: SnapshotListing['intent']): 'buy' | 'sell' | null {
  if (v === 'buy' || v === 0) return 'buy';
  if (v === 'sell' || v === 1) return 'sell';
  return null;
}

export class BackpackTfSource implements MarketDataSource {
  readonly #token: string;
  readonly #baseUrl: string;
  readonly #log: (msg: string) => void;
  readonly #tradeUrl: (steamId: string) => string | undefined;

  constructor(
    token: string,
    opts: {
      log?: (msg: string) => void;
      tradeUrl?: (steamId: string) => string | undefined;
      baseUrl?: string;
    } = {},
  ) {
    if (!token) throw new Error('BPTF_TOKEN is required for DATA_SOURCE=backpacktf');
    this.#token = token;
    this.#log = opts.log ?? (() => {});
    this.#tradeUrl = opts.tradeUrl ?? (() => undefined);
    this.#baseUrl = opts.baseUrl ?? 'https://backpack.tf/api';
  }

  async getListings(sku: string): Promise<Listing[]> {
    const name = SKU_NAMES[sku] ?? sku;
    const url = new URL(`${this.#baseUrl}/classifieds/listings/snapshot`);
    url.searchParams.set('appid', '440');
    url.searchParams.set('sku', name);
    url.searchParams.set('token', this.#token);

    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const text = await res.text();
    if (!res.ok) throw new Error(`backpack.tf snapshot "${name}": HTTP ${res.status} ${text.slice(0, 200)}`);

    let body: SnapshotResponse;
    try {
      body = JSON.parse(text) as SnapshotResponse;
    } catch {
      throw new Error(`backpack.tf snapshot "${name}": non-JSON response ${text.slice(0, 200)}`);
    }
    if (!Array.isArray(body.listings)) {
      throw new Error(
        `backpack.tf snapshot "${name}": no listings array; top-level keys: ${Object.keys(body).join(', ') || '(none)'}`,
      );
    }

    const listings: Listing[] = [];
    let badIntent = 0;
    for (const l of body.listings) {
      const intent = parseIntent(l.intent);
      if (!intent) {
        badIntent++;
        continue;
      }
      listings.push({
        sku,
        intent,
        steamId: l.steamid,
        price: { keys: l.currencies?.keys ?? 0, scrap: refToScrap(l.currencies?.metal ?? 0) },
        automatic: l.userAgent !== undefined,
        // An agent's pulse shows the bot is online now; bumps can be hours old on live listings.
        updatedAt: l.userAgent?.lastPulse ?? l.bump ?? l.timestamp,
        itemId: l.item?.id !== undefined ? String(l.item.id) : undefined,
        tradeOfferUrl: this.#tradeUrl(l.steamid),
        special: (l.item?.attributes ?? []).some((a) => a.defindex !== undefined && SPECIAL_ATTRIBUTES.has(a.defindex)),
      });
    }
    this.#log(
      `backpack.tf "${name}": ${body.listings.length} listings returned` +
        (badIntent ? `, ${badIntent} with unrecognised intent dropped` : ''),
    );
    return listings;
  }
}
