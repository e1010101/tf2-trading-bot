import type { Holdings, Opportunity } from '../types.ts';

export interface ExecutionResult {
  ok: boolean;
  reason?: string;
}

export interface TradeExecutor {
  /** Current tradable pure currency in the backpack. */
  getHoldings(): Promise<Holdings>;
  /** Run both legs: buy from `buyFrom`, then sell to `sellTo`. */
  execute(opp: Opportunity): Promise<ExecutionResult>;
}

/** Why the live executor couldn't send this trade, or null if it has what it needs. */
export function missingTradeInfo(opp: Opportunity): string | null {
  if (!opp.buyFrom.itemId) return 'seller listing has no item ID';
  if (!opp.buyFrom.tradeOfferUrl) return 'no trade URL for seller yet';
  if (!opp.sellTo.tradeOfferUrl) return 'no trade URL for buyer yet';
  return null;
}

/**
 * Simulates fills against an in-memory backpack. Assumes both legs always fill at the listed price.
 * With `requireTradeInfo`, skips trades the live executor couldn't send, so dry runs on live data
 * only count trades that could really happen.
 */
export class PaperExecutor implements TradeExecutor {
  readonly #holdings: Holdings;
  readonly #requireTradeInfo: boolean;

  constructor(start: Holdings, opts: { requireTradeInfo?: boolean } = {}) {
    this.#holdings = { ...start };
    this.#requireTradeInfo = opts.requireTradeInfo ?? false;
  }

  async getHoldings(): Promise<Holdings> {
    return { ...this.#holdings };
  }

  async execute(opp: Opportunity): Promise<ExecutionResult> {
    const missing = this.#requireTradeInfo ? missingTradeInfo(opp) : null;
    if (missing) return { ok: false, reason: missing };
    const pay = opp.buyFrom.price;
    const recv = opp.sellTo.price;
    if (this.#holdings.keys < pay.keys || this.#holdings.scrap < pay.scrap) {
      return { ok: false, reason: 'insufficient funds' };
    }
    this.#holdings.keys += recv.keys - pay.keys;
    this.#holdings.scrap += recv.scrap - pay.scrap;
    return { ok: true };
  }
}
