import type { Holdings, Opportunity } from '../types.ts';
import type { ExecutionResult, TradeExecutor } from './executor.ts';

/**
 * Live executor: not implemented yet.
 *
 * Intended shape (steam-user + steamcommunity + steam-tradeoffer-manager):
 *  1. Log in, load our TF2 inventory, count pure keys / ref / rec / scrap -> getHoldings().
 *  2. Leg 1: send an offer to `buyFrom` paying its price, wait for acceptance (short timeout,
 *     cancel on expiry) and confirm via the mobile authenticator.
 *  3. Re-check that `sellTo` is still listed at the expected price, then send leg 2.
 *  4. If leg 2 fails, the item stays in the backpack: record it and list it for sale rather
 *     than dumping at a loss.
 */
export class SteamExecutor implements TradeExecutor {
  async getHoldings(): Promise<Holdings> {
    throw new Error('SteamExecutor is not implemented; run with DRY_RUN=true');
  }

  async execute(_opp: Opportunity): Promise<ExecutionResult> {
    throw new Error('SteamExecutor is not implemented; run with DRY_RUN=true');
  }
}
