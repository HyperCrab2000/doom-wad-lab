# GZRender-V2

Opt-in GZDoom-derived renderer pipeline for Doom WAD Lab. Existing parser, music, sound, voxel, and WebGL renderer remain untouched by default.

## Success criteria

```txt
GZDoom State == Node State
AND GZDoom Frame == Renderer-V2 Frame
AND Renderer-V2 Event Stream == Expected Event Stream
AND Renderer-V2 runs in browser WASM
AND Existing WAD Lab remains untouched
```

## Execution order (never skip stages)

```txt
GZDoom dump → GZDoom import renderer → frame parity → strip renderer
→ Node GZSTATE export → state parity → event parity → corpus parity → WASM
```

## Living documents (update every session)

| Document | Purpose |
|----------|---------|
| [status.md](./status.md) | Current phase, blockers, parity summary |
| [task-board.md](./task-board.md) | Todo / in progress / blocked / done |
| [HANDOFF.md](./HANDOFF.md) | Next agent pickup instructions |
| [knowledge-base.md](./knowledge-base.md) | Durable discoveries |
| [parity-gap-tracker.md](./parity-gap-tracker.md) | Classified unsupported/failing cases |
| [risk-register.md](./risk-register.md) | Open risks |
| [test-matrix.md](./test-matrix.md) | Test layer commands and status |
| [TESTING.md](../TESTING.md) | Exhaustive test reference (this repo) |
| [wasm-webgl-renderer.md](./wasm-webgl-renderer.md) | **Exhaustive** WASM/WebGL build log, modular stages, parity status |

## Specification

| Topic | Document |
|-------|----------|
| Charter | [project-charter.md](./project-charter.md) |
| Architecture | [architecture-rules.md](./architecture-rules.md) |
| GZSTATE v1 | [gzstate-v1.md](./gzstate-v1.md) |
| Parity | [parity-rules.md](./parity-rules.md) |
| Testing | [testing-rules.md](./testing-rules.md), [testing/README.md](./testing/README.md), [../TESTING.md](../TESTING.md) |
| Corpus | [corpus-testing.md](./corpus-testing.md) |
| Events | [event-system.md](./event-system.md) |
| **Game engine vs renderer** | [game-engine-vs-renderer.md](./game-engine-vs-renderer.md) |
| Federation | [federation-model.md](./federation-model.md) |
| Browser/WASM | [browser-wasm-plan.md](./browser-wasm-plan.md) |
| Memory contract | [project-memory-contract.md](./project-memory-contract.md) |
| ADRs | [adr/](./adr/) |

## Code locations (new work only)

```txt
renderer-v2/
gzstate/
tools/gzrender-v2/
artifacts/gzrender-v2/
```
