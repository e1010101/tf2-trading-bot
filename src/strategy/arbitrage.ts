import { costInScrap, proceedsInScrap } from '../currency.ts';
import { KEY_SKU } from '../types.ts';
import type { KeyRate, Listing, Opportunity } from '../types.ts';

export interface ListingFilter {
  /** Epoch seconds. */
  now: number;
  maxListingAgeS: number;
  /** Our own SteamID64; our listings are never counterparties. */
  ownSteamId?: string;
}

/** Listings we can actually trade against right now. */
export function tradable(listings: Listing[], f: ListingFilter): Listing[] {
  return listings.filter(
    (l) =>
      l.automatic &&
      l.steamId !== f.ownSteamId &&
      f.now - l.updatedAt <= f.maxListingAgeS &&
      // Keys are only ever priced in metal; a key listing asking for keys is junk.
      !(l.sku === KEY_SKU && l.price.keys > 0),
  );
}

/** Derive the key<->metal rate from the key order book. Null if either side is empty. */
export function keyRateFromBook(keyListings: Listing[], f: ListingFilter): KeyRate | null {
  const book = tradable(keyListings, f).filter((l) => l.sku === KEY_SKU);
  const sells = book.filter((l) => l.intent === 'sell').map((l) => l.price.scrap);
  const buys = book.filter((l) => l.intent === 'buy').map((l) => l.price.scrap);
  if (!sells.length || !buys.length) return null;
  return { buy: Math.max(...buys), sell: Math.min(...sells) };
}

/**
 * Crossed-book arbitrage: find the cheapest seller and the highest buyer for one SKU,
 * and report the pair if buying from one and selling to the other nets at least
 * `minProfitScrap` after valuing any keys involved conservatively.
 */
export function findOpportunity(
  sku: string,
  listings: Listing[],
  rate: KeyRate,
  f: ListingFilter,
  minProfitScrap: number,
): Opportunity | null {
  const book = tradable(listings, f).filter((l) => l.sku === sku);

  let buyFrom: Listing | undefined;
  let sellTo: Listing | undefined;
  let cost = Infinity;
  let proceeds = -Infinity;

  for (const l of book) {
    if (l.intent === 'sell') {
      const c = costInScrap(l.price, rate);
      if (c < cost) [cost, buyFrom] = [c, l];
    } else {
      const p = proceedsInScrap(l.price, rate);
      if (p > proceeds) [proceeds, sellTo] = [p, l];
    }
  }

  if (!buyFrom || !sellTo || buyFrom.steamId === sellTo.steamId) return null;
  const profit = proceeds - cost;
  if (profit < minProfitScrap) return null;
  return { sku, buyFrom, sellTo, costScrap: cost, proceedsScrap: proceeds, profitScrap: profit };
}
