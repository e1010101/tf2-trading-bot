import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyPure, holdingsOf, selectPayment } from '../src/execution/payment.ts';
import type { PureItem } from '../src/execution/payment.ts';

function inv(keys: number, ref: number, rec: number, scrap: number): PureItem[] {
  const out: PureItem[] = [];
  const add = (kind: PureItem['kind'], n: number) => {
    for (let i = 0; i < n; i++) out.push({ assetid: `${kind}${i}`, kind });
  };
  add('key', keys); add('ref', ref); add('rec', rec); add('scrap', scrap);
  return out;
}

test('classifies only exact pure names', () => {
  assert.equal(classifyPure('Refined Metal'), 'ref');
  assert.equal(classifyPure('Mann Co. Supply Crate Key'), 'key');
  assert.equal(classifyPure('Non-Craftable Mann Co. Supply Crate Key'), null);
});

test('holdings total keys and scrap', () => {
  assert.deepEqual(holdingsOf(inv(2, 3, 1, 2)), { keys: 2, scrap: 32 });
});

test('pays exact change largest-first', () => {
  assert.deepEqual(selectPayment(inv(1, 2, 2, 2), { keys: 1, scrap: 13 }), ['key0', 'ref0', 'rec0', 'scrap0']);
  assert.deepEqual(selectPayment(inv(0, 0, 3, 0), { keys: 0, scrap: 9 }), ['rec0', 'rec1', 'rec2']);
});

test('returns null without exact change or enough keys', () => {
  assert.equal(selectPayment(inv(0, 2, 0, 0), { keys: 0, scrap: 10 }), null);
  assert.equal(selectPayment(inv(0, 0, 2, 0), { keys: 0, scrap: 4 }), null);
  assert.equal(selectPayment(inv(0, 9, 0, 0), { keys: 1, scrap: 0 }), null);
});
