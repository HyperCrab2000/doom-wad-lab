# Classic layer screenshots (E1M1)

Visual gold for the **Classic WebGL2** layer bible. Each PNG is captured at 1280×900 with SwiftShader ANGLE (same as Puppeteer CI).

## Regenerate

```bash
npm run dev   # :5150
npx tsx tools/gzrender-v2/capture-classic-layer-screenshots.mts
```

Uses `window.__applyClassicLayerPreset()` — no manual layer panel clicking.

## Gallery

| File | Preset | Active layers |
|------|--------|---------------|
| [e1m1-all.png](./e1m1-all.png) | `all` | Everything |
| [e1m1-walls-solid.png](./e1m1-walls-solid.png) | `walls-solid` | Wall geometry + textures only |
| [e1m1-floors.png](./e1m1-floors.png) | `floors` | Floor flats only |
| [e1m1-ceilings.png](./e1m1-ceilings.png) | `ceilings` | Ceiling flats only |
| [e1m1-sky.png](./e1m1-sky.png) | `sky` | Sky + ceilings |
| [e1m1-walls-off.png](./e1m1-walls-off.png) | `walls-off` | No walls — floors/ceilings/sky |

## Used in chapters

- [04 — Walls](../04-layer-walls.md)
- [05 — Flats](../05-layer-flats.md)
- [06 — Sky](../06-layer-sky.md)
- [README](../README.md) gallery table

---

[← Classic Layer Bible](../README.md)
