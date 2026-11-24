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

/** Simulates fills against an in-memory backpack. Assumes both legs always fill at the listed price. */
export class PaperExecutor implements TradeExecutor {
  readonly #holdings: Holdings;

  constructor(start: Holdings) {
    this.#holdings = { ...start };
  }

  async getHoldings(): Promise<Holdings> {
    return { ...this.#holdings };
  }

  async execute(opp: Opportunity): Promise<ExecutionResult> {
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
