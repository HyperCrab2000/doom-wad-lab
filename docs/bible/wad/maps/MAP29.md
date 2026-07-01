# Map deep dive — MAP29 (Map 29)

## Table of contents

- [Corpus role](#corpus-role)
- [WAD lumps](#wad-lumps)
- [Renderer layers to test](#renderer-layers-to-test)
- [Gold gate](#gold-gate)
- [Classic isolation presets](#classic-isolation-presets)
- [Known parity notes](#known-parity-notes)

---

## Corpus role

**MAP29** is part of the **68-map gold corpus**. Spawn-frame `ref.png` from GZDoom GLES is the pixel oracle for this level.

| Field | Value |
|-------|-------|
| Map ID | `MAP29` |
| Official name | Map 29 |
| Notes | Doom II stock level |
| Gold snapshot key | `bspGoldenSnapshots.json` → `MAP29` |

---

## WAD lumps

Every stock map provides the standard lump chain documented in [WAD Ch. 03](../wad/03-map-lumps.md):

```
THINGS → LINEDEFS → SIDEDEFS → VERTEXES → SEGS → SSECTORS → NODES → SECTORS → REJECT → BLOCKMAP
```

Parser entry: `doom-wad-core/src/parser/loadWad.ts`  
GZSTATE export: `exportToGzstate.ts` section builders

---

## Renderer layers to test

Use the Layers panel or programmatic presets on **MAP29**:

| Layer | Classic preset | GZDoom CVAR |
|-------|----------------|-------------|
| Walls | `walls-solid` | `gl_render_walls` |
| Floors | `floors` | `gl_render_flats` |
| Sky | `sky` | `gl_portals` |
| Sprites | `sprites` | `gl_render_things` |

Live toggle tests must keep `data-map-load-state=ready` — no reload.

---

## Gold gate

```bash
# Capture spawn frame vs ref.png
tsx tools/gzrender-v2/gzdoom-wasm-corpus.mts --maps MAP29
```

Tier gates: `strict` (0% diff), `edge`, `bandaid` — see [GZDoom Ch. 15](../gzdoom/15-wasm-host-and-corpus-gates.md).

---

## Classic isolation presets

```
/?renderer=classic&map=MAP29
window.__applyClassicLayerPreset('walls-off')
```

Screenshot corpus template: `docs/bible/classic-layers/screenshots/map29-all.png`

---

## Known parity notes

- Compare GZSTATE static sections before debugging pixels
- If only flats wrong: check `F_SKY` sectors and floor/ceiling pic names
- If walls wrong: linedef sidedef upper/lower on two-sided lines
- Outdoor maps: exercise `courtyardSky` toggle

---

[← Map catalog](../wad/appendix-map-catalog.md) · [Chronicle](../chronicle/README.md)
