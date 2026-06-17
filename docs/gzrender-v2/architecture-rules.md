# Architecture Rules

## Ownership Boundaries

Renderer-V2 owns render-world visual correctness:

- rendering
- sectors
- doors
- lifts
- stairs
- donuts
- crushers/crushing ceilings
- moving floors and ceilings
- switches
- light effects
- transparent and masked walls
- texture animation
- sprites
- voxels
- thing visual state
- event generation

Renderer-V2 does not own:

- sound playback
- music playback
- enemy AI strategy
- quest logic
- UI/HUD implementation
- save/load
- input orchestration

## Module Model

```txt
renderer-v2-core
  - canonical render-world state
  - sector/line/thing visual state
  - draw generation
  - deterministic events

gameplay-ai
  - enemy decisions
  - combat
  - damage
  - inventory
  - weapons/projectiles

quest-logic
  - Hexen-style puzzles
  - hub state
  - ACS/ZScript-like triggers later

audio
  - browser playback from already-parsed assets

hud
  - browser/HUD display from events/state
```

## Backend Abstraction

Renderer core must not be permanently coupled to a single graphics API.

Target backend sequence:

1. Native OpenGL for parity debugging.
2. WASM WebGL2/OpenGL ES-compatible browser path.
3. Future WebGPU backend.
4. Future raytracing/path-tracing backend.

The raytracing backend must be lazy-loadable and separate from the classic backend.

## Vertical Slice Rule

Complete this before broad expansion:

```txt
GZDoom loads first map
-> dumps GZSTATE
-> importer loads GZSTATE
-> renderer draws one frame
-> frame diff runs
-> docs updated
```

Do not start AI, Hexen quest, raytracing, full corpus, or WASM until the native vertical slice exists.
