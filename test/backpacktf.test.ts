import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BackpackTfSource } from '../src/market/backpacktf.ts';

function withFetch(body: unknown, fn: (urls: URL[]) => Promise<void>) {
  const orig = globalThis.fetch;
  const urls: URL[] = [];
  globalThis.fetch = (async (u: URL) => {
    urls.push(u);
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return fn(urls).finally(() => (globalThis.fetch = orig));
}

test('queries by item name and maps both intent formats', () =>
  withFetch(
    {
      listings: [
        { steamid: 'a', intent: 'sell', timestamp: 10, bump: 20, currencies: { metal: 56.33 }, userAgent: { client: 'x' } },
        { steamid: 'b', intent: 0, timestamp: 10, currencies: { metal: 56.11 } },
        { steamid: 'c', intent: 'weird', timestamp: 10, currencies: { metal: 1 } },
      ],
    },
    async (urls) => {
      const got = await new BackpackTfSource('t').getListings('5021;6');
      assert.equal(urls[0]?.searchParams.get('sku'), 'Mann Co. Supply Crate Key');
      assert.deepEqual(
        got.map((l) => [l.steamId, l.intent, l.price.scrap, l.automatic, l.updatedAt]),
        [
          ['a', 'sell', 507, true, 20],
          ['b', 'buy', 505, false, 10],
        ],
      );
    },
  ));

test('unexpected shape is an error, not an empty book', () =>
  withFetch({ message: 'nope' }, async () => {
    await assert.rejects(new BackpackTfSource('t').getListings('5021;6'), /no listings array; top-level keys: message/);
  }));

test('freshness uses the agent pulse, and trade URLs come from the lookup', () =>
  withFetch(
    {
      listings: [
        { steamid: 'a', intent: 'sell', timestamp: 1, bump: 5, currencies: { metal: 1 }, userAgent: { lastPulse: 99 }, item: { id: 123 } },
      ],
    },
    async () => {
      const src = new BackpackTfSource('t', { tradeUrl: (id) => (id === 'a' ? 'https://steamcommunity.com/tradeoffer/new/?partner=1&token=x' : undefined) });
      const [l] = await src.getListings('5021;6');
      assert.equal(l?.updatedAt, 99);
      assert.equal(l?.itemId, '123');
      assert.equal(l?.tradeOfferUrl, 'https://steamcommunity.com/tradeoffer/new/?partner=1&token=x');
    },
  ));

test('flags listings for painted or otherwise special variants', () =>
  withFetch(
    {
      listings: [
        { steamid: 'a', intent: 'buy', timestamp: 1, currencies: { metal: 23 }, item: { attributes: [{ defindex: 142 }] } },
        { steamid: 'b', intent: 'buy', timestamp: 1, currencies: { metal: 12 }, item: { attributes: [{ defindex: 229 }] } },
      ],
    },
    async () => {
      const got = await new BackpackTfSource('t').getListings('The Western Wraps');
      assert.deepEqual(got.map((l) => l.special), [true, false]);
    },
  ));
