import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canAfford, costInScrap, formatPrice, proceedsInScrap, refToScrap, scrapToRef } from '../src/currency.ts';

test('ref <-> scrap round-trips through TF2 ninths notation', () => {
  assert.equal(refToScrap(52.11), 469);
  assert.equal(refToScrap(0.88), 8);
  assert.equal(scrapToRef(469), 52.11);
  for (let s = 0; s < 200; s++) assert.equal(refToScrap(scrapToRef(s)), s);
});

test('keys cost the sell rate to spend and are worth the buy rate to receive', () => {
  const rate = { buy: 500, sell: 510 };
  assert.equal(costInScrap({ keys: 2, scrap: 9 }, rate), 1029);
  assert.equal(proceedsInScrap({ keys: 2, scrap: 9 }, rate), 1009);
});

test('canAfford needs each currency separately', () => {
  assert.equal(canAfford({ keys: 0, scrap: 9999 }, { keys: 1, scrap: 0 }), false);
  assert.equal(canAfford({ keys: 1, scrap: 10 }, { keys: 1, scrap: 10 }), true);
});

test('formatPrice', () => {
  assert.equal(formatPrice({ keys: 1, scrap: 27 }), '1 key + 3.00 ref');
  assert.equal(formatPrice({ keys: 0, scrap: 0 }), '0.00 ref');
});
