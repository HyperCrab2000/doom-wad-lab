# Diamond test pyramid

```
                    ┌─────────────┐
                    │   E2E       │  diamond-e2e-suite.mts
                    │  Puppeteer  │  (browser, full app flows)
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │     Integration         │  test/integration/*.integration.test.ts
              │  vitest + puppeteer/IO    │  WAD pipeline, music, loader, diamond wrapper
              └────────────┬────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         │            Unit                    │  src/**/*.test.ts (~140 files)
         │  parsers, geometry, layers, game   │  vitest --project unit
         └───────────────────────────────────┘
```

## Commands

| Layer | Command |
|-------|---------|
| **Unit** | `npm run test:unit` |
| **Integration** | `npm run test:integration` |
| **E2E diamond** | `npm run test:diamond` |
| **Full pyramid** | `npm run test:pyramid` |

## E2E diamond coverage

| Scenario | Asserts |
|----------|---------|
| App shell | No console errors, chrome visible |
| WAD / map / engine selects | Options present, can change map |
| GZDoom gold | Gold frame or play ready, no crash |
| GZDoom modular (s) play | WASM canvas, HUD, live layer toggle |
| Classic play | WebGL frame, layer preset API |
| PerfMeter | fps/ms numeric + sparkline chart pixels |
| SFX / music chips | Buttons present, toggle without crash |
| Playability | Map stays ready, React root intact |

## CI

`ci.yml` and `deploy.yml` run unit → integration → build → preview smoke → **diamond e2e** on port 4173.
