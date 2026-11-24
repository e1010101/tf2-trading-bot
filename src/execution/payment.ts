import type { Currencies, Holdings } from '../types.ts';

export type PureKind = 'key' | 'ref' | 'rec' | 'scrap';

/** Scrap value of each metal denomination. */
const METAL_SCRAP = { ref: 9, rec: 3, scrap: 1 } as const;

/** Exact market names of pure currency. Anything else (incl. Non-Craftable keys) is not pure. */
const PURE_NAMES: Record<string, PureKind> = {
  'Mann Co. Supply Crate Key': 'key',
  'Refined Metal': 'ref',
  'Reclaimed Metal': 'rec',
  'Scrap Metal': 'scrap',
};

export interface PureItem {
  assetid: string;
  kind: PureKind;
}

export function classifyPure(marketHashName: string): PureKind | null {
  return PURE_NAMES[marketHashName] ?? null;
}

export function holdingsOf(items: PureItem[]): Holdings {
  const h: Holdings = { keys: 0, scrap: 0 };
  for (const i of items) {
    if (i.kind === 'key') h.keys++;
    else h.scrap += METAL_SCRAP[i.kind];
  }
  return h;
}

/**
 * Pick pure items that add up to exactly `price`, or null if this inventory can't make exact
 * change. Greedy largest-first is optimal here because each metal denomination divides the next.
 */
export function selectPayment(items: PureItem[], price: Currencies): string[] | null {
  const byKind: Record<PureKind, string[]> = { key: [], ref: [], rec: [], scrap: [] };
  for (const i of items) byKind[i.kind].push(i.assetid);

  if (byKind.key.length < price.keys) return null;
  const picked = byKind.key.slice(0, price.keys);

  let remaining = price.scrap;
  for (const kind of ['ref', 'rec', 'scrap'] as const) {
    const n = Math.min(byKind[kind].length, Math.floor(remaining / METAL_SCRAP[kind]));
    picked.push(...byKind[kind].slice(0, n));
    remaining -= n * METAL_SCRAP[kind];
  }
  return remaining === 0 ? picked : null;
}
