# Source deep dive — `src/features/level-viewer/LevelViewer.tsx`

## Purpose

Auto-generated index page for the **Complete Technical Bible** expansion. This module participates in the doom-wad-lab / doom-wad-core / gzdoom toolchain.

## Path

`src/features/level-viewer/LevelViewer.tsx`

## Reading guide

1. Open the file in the monorepo under `/Users/williamfarmer/IdeaProjects/doom/`
2. Cross-reference [WAD Bible](../wad/README.md) for parse concerns
3. Cross-reference [GZDoom Bible](../gzdoom/README.md) for C++ oracle concerns
4. Cross-reference [Classic Layer Bible](../classic-layers/README.md) for WebGL2 draw stages

## Layer isolation

When debugging rendering for this module:

| Symptom | Toggle layer | Test |
|---------|--------------|------|
| Parse error | N/A — fix unit tests | `npm run test:unit` |
| Wrong geometry | walls-solid / floors | `test-classic-layers-matrix.mts` |
| WASM diff | GZDoom gold | `test:gzdoom-wasm-corpus` |

## See also

- [Appendix code index](../gzdoom/appendix-code-index.md)
- [Chronicle decisions](../chronicle/decisions/README.md)

---
