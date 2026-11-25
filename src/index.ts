import { fileURLToPath } from 'node:url';
import { Bot } from './bot.ts';
import { loadConfig } from './config.ts';
import { PaperExecutor } from './execution/executor.ts';
import { SteamExecutor } from './execution/steam.ts';
import { BackpackTfSource } from './market/backpacktf.ts';
import { MockSource } from './market/mock.ts';
import { TradeUrlBook } from './market/tradeUrls.ts';
import { tradeLogger } from './tradeLog.ts';

const cfg = loadConfig();
const once = process.argv.includes('--once');
const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);
log(`source=${cfg.dataSource} dryRun=${cfg.dryRun} watchlist=${cfg.watchlist.join(',')}`);

const ac = new AbortController();
process.once('SIGINT', () => ac.abort());
process.once('SIGTERM', () => ac.abort());

let market;
if (cfg.dataSource === 'backpacktf') {
  const tradeUrls = new TradeUrlBook(fileURLToPath(new URL('../data/trade-urls.json', import.meta.url)), log);
  await tradeUrls.load();
  log(`trade URLs: ${tradeUrls.size} known`);
  // A single scan only uses saved URLs; the event feed needs time to collect more.
  if (!once) tradeUrls.start(ac.signal);
  market = new BackpackTfSource(cfg.bptfToken, { log, tradeUrl: (id) => tradeUrls.get(id) });
} else {
  market = new MockSource(fileURLToPath(new URL('../fixtures/market.json', import.meta.url)));
}

const executor = cfg.dryRun
  ? new PaperExecutor(cfg.paperStart, { requireTradeInfo: cfg.dataSource === 'backpacktf' })
  : new SteamExecutor(cfg.steam, log);

const bot = new Bot(cfg, market, executor, {
  log,
  requireTradeInfo: cfg.dataSource === 'backpacktf',
  recordTrade: tradeLogger(fileURLToPath(new URL('../data/trades.jsonl', import.meta.url))),
});

if (once) await bot.tick();
else await bot.run(ac.signal);
