import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Bot } from '../src/bot.ts';
import type { Config } from '../src/config.ts';
import { PaperExecutor } from '../src/execution/executor.ts';
import { findOpportunity, keyRateFromBook } from '../src/strategy/arbitrage.ts';
import { KEY_SKU } from '../src/types.ts';
import type { Listing, MarketDataSource } from '../src/types.ts';

const NOW = 1_000_000;
const filter = { now: NOW, maxListingAgeS: 600, ownSteamId: 'me' };
const rate = { buy: 500, sell: 510 };

function l(sku: string, intent: 'buy' | 'sell', steamId: string, scrap: number, extra: Partial<Listing> = {}): Listing {
  return { sku, intent, steamId, price: { keys: 0, scrap }, automatic: true, updatedAt: NOW, ...extra };
}

test('key rate uses best tradable listing on each side', () => {
  const book = [
    l(KEY_SKU, 'sell', 'a', 510),
    l(KEY_SKU, 'sell', 'b', 505, { automatic: false }),
    l(KEY_SKU, 'buy', 'c', 500),
    l(KEY_SKU, 'buy', 'd', 520, { updatedAt: NOW - 601 }),
    l(KEY_SKU, 'buy', 'me', 530),
  ];
  assert.deepEqual(keyRateFromBook(book, filter), { buy: 500, sell: 510 });
  assert.equal(keyRateFromBook([l(KEY_SKU, 'sell', 'a', 510)], filter), null);
});

test('finds a crossed book', () => {
  const opp = findOpportunity('x', [l('x', 'sell', 'a', 90), l('x', 'sell', 'b', 84), l('x', 'buy', 'c', 87)], rate, filter, 1);
  assert.equal(opp?.buyFrom.steamId, 'b');
  assert.equal(opp?.profitScrap, 3);
});

test('no opportunity on a normal spread or below the profit floor', () => {
  assert.equal(findOpportunity('x', [l('x', 'sell', 'a', 90), l('x', 'buy', 'c', 87)], rate, filter, 1), null);
  assert.equal(findOpportunity('x', [l('x', 'sell', 'a', 84), l('x', 'buy', 'c', 87)], rate, filter, 4), null);
});

test('key spread eats an apparent profit on key-priced listings', () => {
  // Nominally +2 scrap, but the key we pay costs 510 to replace and the one we get sells for 500.
  const listings = [
    l('x', 'sell', 'a', 27, { price: { keys: 1, scrap: 27 } }),
    l('x', 'buy', 'c', 29, { price: { keys: 1, scrap: 29 } }),
  ];
  assert.equal(findOpportunity('x', listings, rate, filter, 1), null);
});

test('bot tick grows paper backpack value and respects affordability', async () => {
  const books: Record<string, Listing[]> = {
    [KEY_SKU]: [l(KEY_SKU, 'sell', 'a', 510), l(KEY_SKU, 'buy', 'c', 500)],
    x: [l('x', 'sell', 'a', 84), l('x', 'buy', 'c', 87)],
    pricey: [l('pricey', 'sell', 'a', 5000), l('pricey', 'buy', 'c', 6000)],
  };
  const market: MarketDataSource = { getListings: async (sku) => books[sku] ?? [] };
  const cfg: Config = {
    dataSource: 'mock', bptfToken: '', steamId: 'me', watchlist: [KEY_SKU, 'x', 'pricey'],
    minProfitScrap: 1, maxTradeCostScrap: 100_000, maxListingAgeS: 1e12, pollIntervalS: 1, dryRun: true,
    paperStart: { keys: 1, scrap: 100 },
  };
  const bot = new Bot(cfg, market, new PaperExecutor(cfg.paperStart), () => {});
  const report = await bot.tick();
  assert.deepEqual(report.executed.map((o) => o.sku), ['x']);
  assert.equal(report.valueScrap, 500 + 103);
});

test('describeBook explains why listings were dropped', async () => {
  const { describeBook } = await import('../src/strategy/arbitrage.ts');
  const book = [
    l(KEY_SKU, 'sell', 'a', 510),
    l(KEY_SKU, 'sell', 'b', 505, { automatic: false }),
    l(KEY_SKU, 'buy', 'd', 520, { updatedAt: NOW - 601 }),
  ];
  assert.equal(describeBook(book, filter), '3 listings, tradable buy=0 sell=1, dropped notAutomatic=1 stale=1');
});
