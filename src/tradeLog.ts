import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TradeRecord } from './bot.ts';

/** Appends one JSON line per attempted trade. Contains Steam IDs and prices, no trade URLs. */
export function tradeLogger(path: string): (t: TradeRecord) => void {
  mkdirSync(dirname(path), { recursive: true });
  return (t) => appendFileSync(path, JSON.stringify(t) + '\n');
}
