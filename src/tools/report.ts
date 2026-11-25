/** Summarises data/trades.jsonl: attempts, fills and profit, split by paper/live. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { TradeRecord } from '../bot.ts';
import { formatRef } from '../currency.ts';

const path = process.argv[2] ?? fileURLToPath(new URL('../../data/trades.jsonl', import.meta.url));
let lines: string[];
try {
  lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
} catch {
  console.log(`no trade log at ${path} yet`);
  process.exit(0);
}
const trades = lines.map((l) => JSON.parse(l) as TradeRecord);

for (const dryRun of [true, false]) {
  const ts = trades.filter((t) => t.dryRun === dryRun);
  if (!ts.length) continue;
  const ok = ts.filter((t) => t.ok);
  const profit = ok.reduce((s, t) => s + t.profitScrap, 0);
  const hours = (Date.parse(ts.at(-1)!.time) - Date.parse(ts[0]!.time)) / 3_600_000 || 0;
  console.log(`${dryRun ? 'paper' : 'live'}: ${ts.length} attempts, ${ok.length} filled, profit ${formatRef(profit)}` +
    (hours ? ` over ${hours.toFixed(1)} h (${formatRef(Math.round(profit / hours))}/h)` : ''));
  const reasons = new Map<string, number>();
  for (const t of ts) if (!t.ok) reasons.set(t.reason ?? 'unknown', (reasons.get(t.reason ?? 'unknown') ?? 0) + 1);
  for (const [r, n] of reasons) console.log(`  failed ${n}x: ${r}`);
}
