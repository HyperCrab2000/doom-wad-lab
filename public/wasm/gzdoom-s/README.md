# GZDoom (s) — modular WASM artifacts

This directory holds the **(s) modular** binary — separate from gold at `../gzdoom/`.

## First-time setup

```bash
npm run bootstrap:gzdoom-s    # copies gold wasm/js/pk3 here (gold dir unchanged)
# or: npm run dev             # predev auto-bootstraps if this folder is empty
```

Then open `?renderer=gzdoom-s-wasm`.

## Verify

```bash
npm run test:gzdoom-s-play    # expects dev server on :5150
```

Gold oracle remains at `?renderer=gzdoom-wasm` → `../gzdoom/`.
