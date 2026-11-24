import { fileURLToPath } from 'node:url';
import { Bot } from './bot.ts';
import { loadConfig } from './config.ts';
import { PaperExecutor } from './execution/executor.ts';
import { SteamExecutor } from './execution/steam.ts';
import { BackpackTfSource } from './market/backpacktf.ts';
import { MockSource } from './market/mock.ts';

const cfg = loadConfig();


const executor = cfg.dryRun ? new PaperExecutor(cfg.paperStart) : new SteamExecutor();

const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);

const market =
  cfg.dataSource === 'backpacktf'
    ? new BackpackTfSource(cfg.bptfToken, log)
    : new MockSource(fileURLToPath(new URL('../fixtures/market.json', import.meta.url)));
log(`source=${cfg.dataSource} dryRun=${cfg.dryRun} watchlist=${cfg.watchlist.join(',')}`);

const bot = new Bot(cfg, market, executor, log);

if (process.argv.includes('--once')) {
  await bot.tick();
} else {
  const ac = new AbortController();
  process.once('SIGINT', () => ac.abort());
  process.once('SIGTERM', () => ac.abort());
  await bot.run(ac.signal);
}
