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
