# GZDoom parity — MAP19

## Spawn frame gate

Compare WASM GLES playfield vs native `ref.png` for **MAP19** (Map 19).

```bash
tsx tools/gzrender-v2/gzdoom-wasm-corpus.mts --maps MAP19
```

## Layer isolation in browser

```
/?renderer=gzdoom-s-wasm&map=MAP19
```

Toggle Layers panel live — must not reload. See [render layer CVARs](./13-render-layer-cvars.md).

## Static GZSTATE first

Before pixel diff, verify `npm run test:corpus` section parity for MAP19.

## Classic cross-check

```
/?renderer=classic&map=MAP19
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

[← Map WAD dive](../wad/maps/MAP19.md) · [Corpus gates](./15-wasm-host-and-corpus-gates.md)
