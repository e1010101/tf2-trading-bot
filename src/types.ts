/** Mann Co. Supply Crate Key */
export const KEY_SKU = '5021;6';

/** A price or balance. Metal is always held as an integer number of scrap (1 ref = 9 scrap). */
export interface Currencies {
  keys: number;
  scrap: number;
}

export interface Listing {
  sku: string;
  /** 'sell' = they sell the item to us; 'buy' = they buy the item from us. */
  intent: 'buy' | 'sell';
  steamId: string;
  price: Currencies;
  /** Listed by a bot that accepts matching offers instantly. Arbitrage needs both legs to be automatic. */
  automatic: boolean;
  /** Epoch seconds of the last bump/update. */
  updatedAt: number;
}

export interface MarketDataSource {
  getListings(sku: string): Promise<Listing[]>;
}

/** What one key is worth in scrap, on each side of the key book. */
export interface KeyRate {
  /** Highest price a bot will pay us for a key: what a key we hold is worth. */
  buy: number;
  /** Lowest price a bot will sell us a key for: what a key we spend costs to replace. */
  sell: number;
}

export interface Opportunity {
  sku: string;
  /** Leg 1: we buy the item from this sell listing. */
  buyFrom: Listing;
  /** Leg 2: we sell the item to this buy listing. */
  sellTo: Listing;
  costScrap: number;
  proceedsScrap: number;
  profitScrap: number;
}

export interface Holdings {
  keys: number;
  scrap: number;
}
