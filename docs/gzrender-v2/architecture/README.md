# Architecture Documentation

Authoritative rules: [architecture-rules.md](../architecture-rules.md), [project-charter.md](../project-charter.md).

## Module layout (target)

```txt
renderer-v2/          # GZDoom-derived renderer core (native → WASM)
gzstate/              # GZSTATE v1 schema, reader/writer, diff
tools/gzrender-v2/    # exporters, importers, corpus runner, frame diff
docs/gzrender-v2/     # project memory (this tree)
artifacts/gzrender-v2/ # generated parity outputs (gitignored)
```

## Existing WAD Lab (untouched by default)

```txt
src/wad/parser/       # WAD lump parsing
src/wad/renderer/     # existing WebGL renderer
src/features/         # React level viewer, music, HUD
```

All new renderer work is **opt-in** and lives outside `src/wad/renderer/` until explicitly integrated.

## Backend sequence

1. Native OpenGL (parity debugging)
2. WASM + WebGL2 (browser)
3. WebGPU (future)
4. Raytracing backend (future, lazy-loaded)
