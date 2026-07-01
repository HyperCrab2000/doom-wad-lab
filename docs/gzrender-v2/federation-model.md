# AI / Quest / Gameplay Federation Model

## Principle

Renderer-V2 must not become the whole game engine. It renders the visually correct world state and emits deterministic events. AI and quest logic are separate modules.

## Modules

```txt
renderer-v2-core.wasm
  - render-world state
  - sector/line/switch simulation needed for visuals
  - thing visual state
  - sprites/voxels/models
  - draw generation
  - event stream

gameplay-ai.wasm or gameplay-ai.ts
  - monster AI
  - combat decisions
  - damage
  - inventory
  - weapon logic
  - projectile logic

quest-logic.wasm or quest-logic.ts
  - Hexen-style puzzles
  - multi-map scripts
  - hub state
  - quest flags
  - ACS/ZScript-like behavior later

audio.ts
  - sound/music playback

hud.ts
  - UI and debugging overlays
```

## Thing Patch API Concept

Renderer-V2 should accept patches like:

```ts
type ThingPatch =
  | { type: 'spawnThing'; thingId: number; thingType: number; x: number; y: number; z: number; angle: number }
  | { type: 'moveThing'; thingId: number; x: number; y: number; z: number; angle: number; velocityX?: number; velocityY?: number; velocityZ?: number }
  | { type: 'setThingState'; thingId: number; stateName: string; frameIndex?: number }
  | { type: 'removeThing'; thingId: number }
  | { type: 'setThingVoxel'; thingId: number; voxelId: string }
  | { type: 'setThingSprite'; thingId: number; spriteId: string; frame: string };
```

## Hexen Future-Proofing

Quest logic and hub scripting belong outside renderer core. Renderer-V2 should consume resulting world/thing patches and render them.
