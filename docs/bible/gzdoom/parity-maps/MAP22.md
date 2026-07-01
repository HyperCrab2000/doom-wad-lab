# GZDoom parity — MAP22

## Spawn frame gate

Compare WASM GLES playfield vs native `ref.png` for **MAP22** (Map 22).

```bash
tsx tools/gzrender-v2/gzdoom-wasm-corpus.mts --maps MAP22
```

## Layer isolation in browser

```
/?renderer=gzdoom-s-wasm&map=MAP22
```

Toggle Layers panel live — must not reload. See [render layer CVARs](./13-render-layer-cvars.md).

## Static GZSTATE first

Before pixel diff, verify `npm run test:corpus` section parity for MAP22.

## Classic cross-check

```
/?renderer=classic&map=MAP22
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

[← Map WAD dive](../wad/maps/MAP22.md) · [Corpus gates](./15-wasm-host-and-corpus-gates.md)
