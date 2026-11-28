/**
 * Finds items worth adding to WATCHLIST by following backpack.tf's public event feed.
 *
 * It keeps the latest version of every automatic, metal-priced listing it sees (dropping
 * deleted ones) and, per item, reports how many bots are on each side, the best bid and ask,
 * and whether the book was ever crossed (best bid above best ask) while it watched.
 *
 * Usage: npm run survey [-- <minutes>]   (default 20). Prints no trade URLs.
 */
import { refToScrap, formatRef } from '../currency.ts';

const minutes = Number(process.argv[2] ?? 20);

interface Side {
  price: number; // scrap
  steamid: string;
}
interface Book {
  buys: Map<string, Side>;
  sells: Map<string, Side>;
  crossedChecks: number;
  checks: number;
}

const books = new Map<string, Book>();
const owner = new Map<string, string>(); // listing id -> item name
let events = 0;

function book(name: string): Book {
  let b = books.get(name);
  if (!b) books.set(name, (b = { buys: new Map(), sells: new Map(), crossedChecks: 0, checks: 0 }));
  return b;
}

function best(b: Book): { bid?: Side; ask?: Side } {
  let bid: Side | undefined;
  let ask: Side | undefined;
  for (const s of b.buys.values()) if (!bid || s.price > bid.price) bid = s;
  for (const s of b.sells.values()) if (!ask || s.price < ask.price) ask = s;
  return { bid, ask };
}

const ws = new WebSocket('wss://ws.backpack.tf/events');
ws.addEventListener('message', (m) => {
  let frame: unknown;
  try {
    frame = JSON.parse(String(m.data));
  } catch {
    return;
  }
  for (const e of (Array.isArray(frame) ? frame : [frame]) as Array<Record<string, any>>) {
    const p = e?.payload;
    if (!p?.id) continue;
    events++;
    const name = owner.get(p.id);
    if (e.event === 'listing-delete') {
      if (name) {
        books.get(name)?.buys.delete(p.id);
        books.get(name)?.sells.delete(p.id);
        owner.delete(p.id);
      }
      continue;
    }
    if (e.event !== 'listing-update') continue;
    const itemName: string | undefined = p.item?.name;
    const metal = p.currencies?.metal;
    // Automatic bots only, priced purely in metal, tradable and craftable-as-named.
    if (!itemName || !p.userAgent || p.currencies?.keys || typeof metal !== 'number') continue;
    const b = book(itemName);
    owner.set(p.id, itemName);
    const side = { price: refToScrap(metal), steamid: p.steamid as string };
    if (p.intent === 'buy') b.buys.set(p.id, side);
    else b.sells.set(p.id, side);

    const { bid, ask } = best(b);
    if (bid && ask && bid.steamid !== ask.steamid) {
      b.checks++;
      if (bid.price > ask.price) b.crossedChecks++;
    }
  }
});

setTimeout(() => {
  ws.close();
  const rows = [...books.entries()]
    .map(([name, b]) => {
      const { bid, ask } = best(b);
      const bots = (m: Map<string, Side>) => new Set([...m.values()].map((s) => s.steamid)).size;
      return { name, b, bid, ask, buyBots: bots(b.buys), sellBots: bots(b.sells) };
    })
    .filter((r) => r.buyBots >= 2 && r.sellBots >= 2)
    .sort((x, y) => y.b.crossedChecks - x.b.crossedChecks || Math.min(y.buyBots, y.sellBots) - Math.min(x.buyBots, x.sellBots))
    .slice(0, 30);

  console.log(`${events} events over ${minutes} min; ${books.size} items with automatic metal listings`);
  console.log('item | bots buy/sell | best bid / ask | crossed while watched');
  for (const r of rows) {
    const crossed = r.b.checks ? `${Math.round((100 * r.b.crossedChecks) / r.b.checks)}% of updates` : '-';
    console.log(
      `${r.name} | ${r.buyBots}/${r.sellBots} | ${r.bid ? formatRef(r.bid.price) : '-'} / ${r.ask ? formatRef(r.ask.price) : '-'} | ${crossed}`,
    );
  }
  process.exit(0);
}, minutes * 60_000);
