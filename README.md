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

## Not done yet

- `SteamExecutor` (`src/execution/steam.ts`) is written but has not run against Steam. It also
  needs each listing's trade offer URL, which the backpack.tf client doesn't map yet.
  `npm run dump-listings` prints raw listings to find the right fields.
- No persistence of trades or value history.
