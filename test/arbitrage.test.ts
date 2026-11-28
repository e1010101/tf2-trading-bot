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
    minProfitScrap: 1, maxProfitPct: 10, maxTradeCostScrap: 100_000, maxListingAgeS: 1e12, pollIntervalS: 1, dryRun: true,
    paperStart: { keys: 1, scrap: 100 },
    steam: { accountName: '', password: '', sharedSecret: '', identitySecret: '' },
  };
  const bot = new Bot(cfg, market, new PaperExecutor(cfg.paperStart), { log: () => {} });
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

test('paper executor in strict mode skips trades the live executor could not send', async () => {
  const exec = new PaperExecutor({ keys: 0, scrap: 1000 }, { requireTradeInfo: true });
  const opp = { sku: 'x', buyFrom: l('x', 'sell', 'a', 84), sellTo: l('x', 'buy', 'c', 87), costScrap: 84, proceedsScrap: 87, profitScrap: 3 };
  assert.deepEqual(await exec.execute(opp), { ok: false, reason: 'seller listing has no item ID' });
  const ready = {
    ...opp,
    buyFrom: { ...opp.buyFrom, itemId: '1', tradeOfferUrl: 'u' },
    sellTo: { ...opp.sellTo, tradeOfferUrl: 'u' },
  };
  assert.deepEqual(await exec.execute(ready), { ok: true });
});

test('falls back to the best seller with trade info, and never buys the same item twice', async () => {
  const url = 'https://steamcommunity.com/tradeoffer/new/?partner=1&token=x';
  const books: Record<string, Listing[]> = {
    [KEY_SKU]: [
      l(KEY_SKU, 'sell', 'cheap-no-url', 600, { itemId: 'k0' }),
      l(KEY_SKU, 'sell', 'seller', 610, { itemId: 'k1', tradeOfferUrl: url }),
      l(KEY_SKU, 'sell', 'seller2', 612, { itemId: 'k2', tradeOfferUrl: url }),
      l(KEY_SKU, 'buy', 'buyer', 620, { tradeOfferUrl: url }),
    ],
  };
  const market: MarketDataSource = { getListings: async (sku) => books[sku] ?? [] };
  const cfg: Config = {
    dataSource: 'backpacktf', bptfToken: '', steamId: 'me', watchlist: [KEY_SKU],
    minProfitScrap: 1, maxProfitPct: 10, maxTradeCostScrap: 100_000, maxListingAgeS: 1e12, pollIntervalS: 1, dryRun: true,
    paperStart: { keys: 0, scrap: 5000 },
    steam: { accountName: '', password: '', sharedSecret: '', identitySecret: '' },
  };
  const records: string[] = [];
  const bot = new Bot(cfg, market, new PaperExecutor(cfg.paperStart, { requireTradeInfo: true }), {
    log: () => {},
    requireTradeInfo: true,
    recordTrade: (t) => records.push(`${t.sellerItemId}:${t.ok}`),
  });
  const ids = async () => (await bot.tick()).executed.map((o) => o.buyFrom.itemId);
  assert.deepEqual(await ids(), ['k1']);
  assert.deepEqual(await ids(), ['k2']);
  assert.deepEqual(await ids(), []);
  assert.deepEqual(records, ['k1:true', 'k2:true']);
});

test('special-variant listings are not tradable', () => {
  const book = [l('x', 'sell', 'a', 84), l('x', 'buy', 'c', 200, { special: true }), l('x', 'buy', 'd', 87)];
  const opp = findOpportunity('x', book, rate, filter, 1);
  assert.equal(opp?.sellTo.steamId, 'd');
});

test('bot skips trades with implausible profit', async () => {
  const books: Record<string, Listing[]> = {
    [KEY_SKU]: [l(KEY_SKU, 'sell', 'a', 510), l(KEY_SKU, 'buy', 'c', 500)],
    hat: [l('hat', 'sell', 'a', 110), l('hat', 'buy', 'c', 207)],
  };
  const market: MarketDataSource = { getListings: async (sku) => books[sku] ?? [] };
  const cfg: Config = {
    dataSource: 'mock', bptfToken: '', steamId: 'me', watchlist: ['hat'],
    minProfitScrap: 1, maxProfitPct: 10, maxTradeCostScrap: 100_000, maxListingAgeS: 1e12, pollIntervalS: 1, dryRun: true,
    paperStart: { keys: 0, scrap: 1000 },
    steam: { accountName: '', password: '', sharedSecret: '', identitySecret: '' },
  };
  const logs: string[] = [];
  const bot = new Bot(cfg, market, new PaperExecutor(cfg.paperStart), { log: (m) => logs.push(m) });
  assert.deepEqual((await bot.tick()).executed, []);
  assert.ok(logs.some((m) => m.includes('probably a buyer wanting a special variant')));
});
