import type { Config } from './config.ts';
import { canAfford, formatPrice, formatRef, holdingsValueScrap } from './currency.ts';
import type { TradeExecutor } from './execution/executor.ts';
import { describeBook, findOpportunity, keyRateFromBook } from './strategy/arbitrage.ts';
import type { ListingFilter } from './strategy/arbitrage.ts';
import { KEY_SKU } from './types.ts';
import type { MarketDataSource, Opportunity } from './types.ts';

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

  constructor(
    cfg: Config,
    market: MarketDataSource,
    executor: TradeExecutor,
    log: (msg: string) => void = console.log,
  ) {
    this.#cfg = cfg;
    this.#market = market;
    this.#executor = executor;
    this.#log = log;
  }

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
        const opp = findOpportunity(sku, listings, rate, filter, this.#cfg.minProfitScrap);
        if (!opp) continue;

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
