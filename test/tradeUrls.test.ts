import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { TradeUrlBook } from '../src/market/tradeUrls.ts';

const URL_A = 'https://steamcommunity.com/tradeoffer/new/?partner=1&token=aaa';

test('ingests batched listing-update events and ignores the rest', () => {
  const book = new TradeUrlBook('/unused');
  book.ingest([
    { event: 'listing-update', payload: { steamid: '1', user: { id: '1', tradeOfferUrl: URL_A } } },
    { event: 'listing-delete', payload: { steamid: '2', user: { id: '2', tradeOfferUrl: URL_A } } },
    { event: 'listing-update', payload: { steamid: '3', user: { id: '3', tradeOfferUrl: 'https://evil.example/' } } },
  ]);
  book.ingest({ event: 'listing-update', payload: { steamid: '4', user: { tradeOfferUrl: URL_A } } });
  assert.equal(book.get('1'), URL_A);
  assert.equal(book.get('2'), undefined);
  assert.equal(book.get('3'), undefined);
  assert.equal(book.get('4'), URL_A);
});

test('saves and reloads', async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'tradeurls-')), 'sub', 'urls.json');
  const a = new TradeUrlBook(path);
  a.record('1', URL_A);
  await a.save();
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { '1': URL_A });
  const b = new TradeUrlBook(path);
  await b.load();
  assert.equal(b.get('1'), URL_A);
});
