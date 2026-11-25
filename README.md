# tf2-trading-bot

Scaffold for a bot that grows a TF2 backpack's value by arbitraging the key/metal classifieds.

## Strategy

For each SKU on the watchlist the bot looks for a **crossed book**: an automated seller whose
price is below an automated buyer's price. It buys from the first and sells to the second.

- All metal is integer scrap (1 ref = 9 scrap), so there are no `.11` rounding errors.
- The key/metal rate comes from the key book itself. Keys we spend are valued at the lowest
  sell price, keys we receive at the highest buy price, so the key spread can never be
  mistaken for profit.
- Only fresh listings from automated traders count, and never our own.
- Risk controls: minimum profit, per-trade cost cap, and an affordability check per currency.

## Run

Needs Node >= 22.18 (runs TypeScript directly; no build step).

    npm install
    npm test
    npm run once     # one scan
    npm start        # poll forever

With no `.env` it paper-trades against `fixtures/market.json`. Copy `.env.example` to `.env`
to configure.

## Layout

| Path | Purpose |
| --- | --- |
| `src/currency.ts` | scrap/ref maths and valuation |
| `src/strategy/arbitrage.ts` | listing filter, key rate, opportunity finder (pure functions) |
| `src/market/` | `MarketDataSource` implementations: fixture mock, backpack.tf snapshot |
| `src/execution/` | `TradeExecutor`: paper executor, Steam stub |
| `src/bot.ts` | scan loop and risk checks |

## Trade URLs

backpack.tf's listing snapshot doesn't include trade offer URLs, which Steam requires to send
offers to non-friends. While `npm start` runs, the bot follows backpack.tf's public event feed
and saves each trader's URL to `data/trade-urls.json` (gitignored: it holds trade tokens).
A trade is only attempted once both sides' URLs are known, in paper mode too.

## Measuring results

Every attempted trade is appended to `data/trades.jsonl`. `npm run report` summarises it:
attempts, fills, profit and profit per hour, split into paper and live, plus why trades failed.

## Not done yet

- `SteamExecutor` (`src/execution/steam.ts`) is written but has not run against Steam.
- No history of backpack value over time (only per-trade records).
