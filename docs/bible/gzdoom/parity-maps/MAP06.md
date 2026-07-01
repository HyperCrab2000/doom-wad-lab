# GZDoom parity — MAP06

## Spawn frame gate

Compare WASM GLES playfield vs native `ref.png` for **MAP06** (Map 06).

```bash
tsx tools/gzrender-v2/gzdoom-wasm-corpus.mts --maps MAP06
```

## Layer isolation in browser

```
/?renderer=gzdoom-s-wasm&map=MAP06
```

Toggle Layers panel live — must not reload. See [render layer CVARs](./13-render-layer-cvars.md).

## Static GZSTATE first

Before pixel diff, verify `npm run test:corpus` section parity for MAP06.

## Classic cross-check

```
/?renderer=classic&map=MAP06
window.__applyClassicLayerPreset('all')
```

## Failure triage

| Diff region | Check |
|-------------|-------|
| Sky band | F_SKY sectors, gl_portals |
| Floor color | flat lumps, lightlevel |
| Wall texture | PNAMES, missing patch |
| Sprites | thing types present at spawn view |

---

[← Map WAD dive](../wad/maps/MAP06.md) · [Corpus gates](./15-wasm-host-and-corpus-gates.md)
