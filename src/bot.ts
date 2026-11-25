import type { Config } from './config.ts';
import { canAfford, formatPrice, formatRef, holdingsValueScrap } from './currency.ts';
import type { TradeExecutor } from './execution/executor.ts';
import { describeBook, findOpportunity, hasTradeInfo, keyRateFromBook } from './strategy/arbitrage.ts';
import type { ListingFilter } from './strategy/arbitrage.ts';
import { KEY_SKU } from './types.ts';
import type { Currencies, Listing, MarketDataSource, Opportunity } from './types.ts';

export interface TradeRecord {
  time: string;
  sku: string;
  dryRun: boolean;
  ok: boolean;
  reason?: string;
  seller: string;
  sellerItemId?: string;
  buyPrice: Currencies;
  buyer: string;
  sellPrice: Currencies;
  profitScrap: number;
}

export interface BotOptions {
  log?: (msg: string) => void;
  /** Only trade against listings the live executor can act on (item ID and trade URLs known). */
  requireTradeInfo?: boolean;
  /** Called once per attempted trade, successful or not. */
  recordTrade?: (t: TradeRecord) => void;
}

export interface TickReport {
  /** Null when the key book was unusable and the tick was skipped. */
  valueScrap: number | null;
  executed: Opportunity[];
}

export class Bot {
  readonly #cfg: Config;
  readonly #market: MarketDataSource;
  readonly #executor: TradeExecutor;
  readonly #log: (msg: string) => void;
  readonly #requireTradeInfo: boolean;
  readonly #recordTrade: (t: TradeRecord) => void;
  /**
   * Seller item IDs we have already traded for. A listing can stay in the snapshot for a while
   * after it fills; without this, paper trading counts the same key every minute and live
   * trading would resend offers for an item that is gone.
   */
  readonly #usedItems = new Set<string>();

  constructor(cfg: Config, market: MarketDataSource, executor: TradeExecutor, opts: BotOptions = {}) {
    this.#cfg = cfg;
    this.#market = market;
    this.#executor = executor;
    this.#log = opts.log ?? console.log;
    this.#requireTradeInfo = opts.requireTradeInfo ?? false;
    this.#recordTrade = opts.recordTrade ?? (() => {});
  }

  #notUsed = (l: Listing): boolean => !(l.intent === 'sell' && l.itemId && this.#usedItems.has(l.itemId));

  #usable = (l: Listing): boolean => this.#notUsed(l) && (!this.#requireTradeInfo || hasTradeInfo(l));

  /** One scan of the watchlist: price keys, look for crossed books, execute what passes risk checks. */
  async tick(): Promise<TickReport> {
    const filter: ListingFilter = {
      now: Math.floor(Date.now() / 1000),
      maxListingAgeS: this.#cfg.maxListingAgeS,
      ownSteamId: this.#cfg.steamId,
    };

    const keyBook = await this.#market.getListings(KEY_SKU);
    const rate = keyRateFromBook(keyBook, filter);
    if (!rate) {
      this.#log(`key book has no tradable buy or sell side (${describeBook(keyBook, filter)}); skipping tick`);
      return { valueScrap: null, executed: [] };
    }

    const executed: Opportunity[] = [];
    for (const sku of this.#cfg.watchlist) {
      try {
        const listings = sku === KEY_SKU ? keyBook : await this.#market.getListings(sku);
        const opp = findOpportunity(sku, listings, rate, filter, this.#cfg.minProfitScrap, this.#usable);
        if (!opp) {
          if (findOpportunity(sku, listings, rate, filter, this.#cfg.minProfitScrap, this.#notUsed)) {
            this.#log(`${sku}: book is crossed, but no counterparty pair with known trade URLs yet`);
          }
          continue;
        }

        const holdings = await this.#executor.getHoldings();
        if (opp.costScrap > this.#cfg.maxTradeCostScrap) {
          this.#log(`${sku}: skip, cost ${formatRef(opp.costScrap)} over per-trade cap`);
          continue;
        }
        if (!canAfford(holdings, opp.buyFrom.price)) {
          this.#log(`${sku}: skip, cannot pay ${formatPrice(opp.buyFrom.price)}`);
          continue;
        }

        const res = await this.#executor.execute(opp);
        // Never retry the same item: it filled, or its seller didn't accept our offer.
        if (opp.buyFrom.itemId) this.#usedItems.add(opp.buyFrom.itemId);
        this.#recordTrade({
          time: new Date().toISOString(),
          sku,
          dryRun: this.#cfg.dryRun,
          ok: res.ok,
          reason: res.reason,
          seller: opp.buyFrom.steamId,
          sellerItemId: opp.buyFrom.itemId,
          buyPrice: opp.buyFrom.price,
          buyer: opp.sellTo.steamId,
          sellPrice: opp.sellTo.price,
          profitScrap: opp.profitScrap,
        });
        if (res.ok) {
          executed.push(opp);
          this.#log(
            `${sku}: bought for ${formatPrice(opp.buyFrom.price)} from ${opp.buyFrom.steamId}, ` +
              `sold for ${formatPrice(opp.sellTo.price)} to ${opp.sellTo.steamId} ` +
              `(+${formatRef(opp.profitScrap)})`,
          );
        } else {
          this.#log(`${sku}: execution failed: ${res.reason ?? 'unknown'}`);
        }
      } catch (err) {
        this.#log(`${sku}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const holdings = await this.#executor.getHoldings();
    const valueScrap = holdingsValueScrap(holdings, rate);
    this.#log(
      `backpack: ${formatPrice(holdings)} = ${formatRef(valueScrap)} ` +
        `(key ${formatRef(rate.buy)} / ${formatRef(rate.sell)})`,
    );
    return { valueScrap, executed };
  }

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        await this.tick();
      } catch (err) {
        this.#log(`tick failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, this.#cfg.pollIntervalS * 1000);
        signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
      });
    }
  }
}
