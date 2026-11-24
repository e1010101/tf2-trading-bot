import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const EVENTS_URL = 'wss://ws.backpack.tf/events';
const TRADE_URL_PREFIX = 'https://steamcommunity.com/tradeoffer/new/';

/**
 * Collects traders' trade offer URLs from backpack.tf's public listing event feed.
 *
 * The classifieds snapshot omits trade URLs, but every `listing-update` event carries
 * `payload.user.tradeOfferUrl`. Events only fire when a listing is created or changed (not on
 * bumps), so coverage builds up while the bot runs; the map is saved to disk so it survives
 * restarts. The file holds other traders' trade tokens: keep it local (data/ is gitignored).
 */
export class TradeUrlBook {
  readonly #urls = new Map<string, string>();
  readonly #path: string;
  readonly #log: (msg: string) => void;
  #dirty = false;

  constructor(path: string, log: (msg: string) => void = () => {}) {
    this.#path = path;
    this.#log = log;
  }

  get size(): number {
    return this.#urls.size;
  }

  get(steamId: string): string | undefined {
    return this.#urls.get(steamId);
  }

  record(steamId: unknown, url: unknown): void {
    if (typeof steamId !== 'string' || typeof url !== 'string' || !url.startsWith(TRADE_URL_PREFIX)) return;
    if (this.#urls.get(steamId) === url) return;
    this.#urls.set(steamId, url);
    this.#dirty = true;
  }

  /** Accepts one websocket frame: a single event or an array of events. */
  ingest(frame: unknown): void {
    for (const ev of Array.isArray(frame) ? frame : [frame]) {
      const e = ev as { event?: string; payload?: { steamid?: unknown; user?: { id?: unknown; tradeOfferUrl?: unknown } } };
      if (e?.event !== 'listing-update' || !e.payload) continue;
      this.record(e.payload.user?.id ?? e.payload.steamid, e.payload.user?.tradeOfferUrl);
    }
  }

  async load(): Promise<void> {
    try {
      const data = JSON.parse(await readFile(this.#path, 'utf8')) as Record<string, string>;
      for (const [id, url] of Object.entries(data)) this.record(id, url);
      this.#dirty = false;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async save(): Promise<void> {
    if (!this.#dirty) return;
    this.#dirty = false;
    await mkdir(dirname(this.#path), { recursive: true });
    await writeFile(this.#path, JSON.stringify(Object.fromEntries(this.#urls)));
  }

  /** Follow the event feed until `signal` aborts, reconnecting with backoff and saving every minute. */
  start(signal: AbortSignal): void {
    let delay = 1_000;
    const connect = () => {
      if (signal.aborted) return;
      const ws = new WebSocket(EVENTS_URL);
      ws.addEventListener('open', () => {
        delay = 1_000;
        this.#log(`trade URLs: connected to backpack.tf events (${this.size} known)`);
      });
      ws.addEventListener('message', (m) => {
        try {
          this.ingest(JSON.parse(String(m.data)));
        } catch {
          // Ignore malformed frames.
        }
      });
      ws.addEventListener('close', () => {
        if (signal.aborted) return;
        setTimeout(connect, delay);
        delay = Math.min(delay * 2, 60_000);
      });
      signal.addEventListener('abort', () => ws.close(), { once: true });
    };
    connect();

    const saver = setInterval(() => void this.save().catch((e) => this.#log(`trade URLs: save failed: ${e}`)), 60_000);
    signal.addEventListener('abort', () => (clearInterval(saver), void this.save()), { once: true });
  }
}
