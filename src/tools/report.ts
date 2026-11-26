/**
 * Summarises data/trades.jsonl: attempts, fills and profit, split by paper/live.
 * Usage: npm run report [-- --since <date/time>] [path]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { TradeRecord } from '../bot.ts';
import { formatRef } from '../currency.ts';

const args = process.argv.slice(2);
const sinceAt = args.indexOf('--since');
const since = sinceAt >= 0 ? Date.parse(args[sinceAt + 1] ?? '') : -Infinity;
if (Number.isNaN(since)) throw new Error('--since needs a date, e.g. --since 2026-11-25T12:00');
if (sinceAt >= 0) args.splice(sinceAt, 2);
const path = args[0] ?? fileURLToPath(new URL('../../data/trades.jsonl', import.meta.url));
let lines: string[];
try {
  lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
} catch {
  console.log(`no trade log at ${path} yet`);
  process.exit(0);
}
const trades = lines.map((l) => JSON.parse(l) as TradeRecord).filter((t) => Date.parse(t.time) >= since);
if (sinceAt >= 0) console.log(`trades since ${new Date(since).toISOString()}: ${trades.length}`);

for (const dryRun of [true, false]) {
  const ts = trades.filter((t) => t.dryRun === dryRun);
  if (!ts.length) continue;
  const ok = ts.filter((t) => t.ok);
  const profit = ok.reduce((s, t) => s + t.profitScrap, 0);
  const hours = (Date.parse(ts.at(-1)!.time) - Date.parse(ts[0]!.time)) / 3_600_000 || 0;
  console.log(`${dryRun ? 'paper' : 'live'}: ${ts.length} attempts, ${ok.length} filled, profit ${formatRef(profit)}` +
    (hours ? ` over ${hours.toFixed(1)} h (${formatRef(Math.round(profit / hours))}/h)` : ''));
  if (ok.length) {
    const count = (key: (t: TradeRecord) => string) => {
      const m = new Map<string, number>();
      for (const t of ok) m.set(key(t), (m.get(key(t)) ?? 0) + 1);
      return m;
    };
    const buyers = count((t) => t.buyer);
    const sellers = count((t) => t.seller);
    const top = [...buyers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    console.log(`  ${sellers.size} distinct sellers, ${buyers.size} distinct buyers`);
    console.log(`  busiest buyers: ${top.map(([id, n]) => `${id} x${n}`).join(', ')}`);
    const buckets = [
      ['1-2 scrap', (p: number) => p <= 2],
      ['3-5 scrap', (p: number) => p >= 3 && p <= 5],
      ['6-8 scrap', (p: number) => p >= 6 && p <= 8],
      ['1 ref +', (p: number) => p >= 9],
    ] as const;
    console.log(
      '  profit per trade: ' +
        buckets
          .map(([label, test]) => {
            const b = ok.filter((t) => test(t.profitScrap));
            return `${label}: ${b.length} (${formatRef(b.reduce((s, t) => s + t.profitScrap, 0))})`;
          })
          .join(', '),
    );
  }
  const reasons = new Map<string, number>();
  for (const t of ts) if (!t.ok) reasons.set(t.reason ?? 'unknown', (reasons.get(t.reason ?? 'unknown') ?? 0) + 1);
  for (const [r, n] of reasons) console.log(`  failed ${n}x: ${r}`);
}
