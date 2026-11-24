import type { Currencies, Holdings, KeyRate } from './types.ts';

export const SCRAP_PER_REF = 9;

/** 52.11 ref -> 469 scrap. TF2 writes ninths of a ref as .11, .22 ... .88. */
export function refToScrap(ref: number): number {
  return Math.round(ref * SCRAP_PER_REF);
}

/** 469 scrap -> 52.11 */
export function scrapToRef(scrap: number): number {
  const sign = scrap < 0 ? -1 : 1;
  const abs = Math.abs(scrap);
  const whole = Math.trunc(abs / SCRAP_PER_REF);
  const ninths = abs % SCRAP_PER_REF;
  return sign * Number((whole + ninths * 0.11).toFixed(2));
}

export function formatRef(scrap: number): string {
  return `${scrapToRef(scrap).toFixed(2)} ref`;
}

export function formatPrice(p: Currencies): string {
  const parts: string[] = [];
  if (p.keys) parts.push(`${p.keys} key${p.keys === 1 ? '' : 's'}`);
  if (p.scrap || !p.keys) parts.push(formatRef(p.scrap));
  return parts.join(' + ');
}

/** What it costs us to pay this price (keys valued at replacement cost). */
export function costInScrap(p: Currencies, rate: KeyRate): number {
  return p.scrap + p.keys * rate.sell;
}

/** What receiving this price is worth to us (keys valued at what we can liquidate them for). */
export function proceedsInScrap(p: Currencies, rate: KeyRate): number {
  return p.scrap + p.keys * rate.buy;
}

/** Conservative backpack value: keys counted at the price we could sell them for right now. */
export function holdingsValueScrap(h: Holdings, rate: KeyRate): number {
  return h.scrap + h.keys * rate.buy;
}

export function canAfford(h: Holdings, p: Currencies): boolean {
  return h.keys >= p.keys && h.scrap >= p.scrap;
}
