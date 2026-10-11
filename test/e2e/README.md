# E2E tests

Playwright scripts that drive a real browser against the dev server.

These exist because the unit suite cannot catch integration bugs. A double-KO
deadlock that stalled battles at 97 turns passed 20/20 unit tests; it was only
visible by actually playing a game.

## Running

```bash
npm run test:e2e          # battle + mirror-match tests
npm run test:e2e:perf     # cold vs warm load measurements
```

The scripts start a dev server if none is answering at `BASE`, so a cold
checkout works. If one is already running they reuse it.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `BASE` | `http://localhost:5173/` | URL of the app under test |
| `CHROMIUM_PATH` | Playwright's bundled Chromium | Path to a browser binary |

Playwright does not download browsers with `playwright-core`. Either install
them (`npx playwright install chromium`) or point `CHROMIUM_PATH` at an
existing Chromium.

## Scripts

| File | Asserts |
| --- | --- |
| `battle.test.mjs` | A full battle reaches a result without stalling, and no JS errors fire |
| `mirror.test.mjs` | Stealing a challenger species swaps that challenger slot instead of creating a mirror match |
| `perf.mjs` | Reports request counts and load time, cold vs warm (informational) |

`battle.test.mjs` detects a stall by watching the battle log: if the log stops
growing while the turn counter keeps advancing, the engine is deadlocked. That
signature is what the double-KO bug produced.
