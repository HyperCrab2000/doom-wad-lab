# Event System and Render-World State Machine

## Purpose

Renderer-V2 must know enough about the rendered world to emit sound/music/HUD/world/thing events while the map is being played. It does not play audio; it only emits deterministic triggers.

## Event Requirements

Events must be:

- deterministic
- serializable
- replayable
- versioned
- diffable
- ordered by tick

## Example Event Types

```ts
type RendererEvent =
  | { tick: number; type: 'playSound'; soundId: string; channel?: string; sourceKind: 'sector' | 'line' | 'thing' | 'world' | 'player'; sourceId: number; x?: number; y?: number; z?: number }
  | { tick: number; type: 'stopSound'; soundId?: string; channel?: string; sourceKind: string; sourceId: number }
  | { tick: number; type: 'startMusic'; musicId: string }
  | { tick: number; type: 'thingStateChanged'; thingId: number; oldState: string; newState: string }
  | { tick: number; type: 'thingSpawned'; thingId: number; thingType: string; x: number; y: number; z: number }
  | { tick: number; type: 'thingRemoved'; thingId: number; reason: string }
  | { tick: number; type: 'sectorMoveStarted'; sectorId: number; moverType: string }
  | { tick: number; type: 'sectorMoveStopped'; sectorId: number; moverType: string }
  | { tick: number; type: 'switchChanged'; lineId: number; oldTexture: string; newTexture: string }
  | { tick: number; type: 'lineActivated'; lineId: number; special: number; tag: number }
  | { tick: number; type: 'secretTriggered'; sectorId: number }
  | { tick: number; type: 'exitTriggered'; lineId: number; exitType: string }
  | { tick: number; type: 'hudStateChanged'; key: string; value: unknown };
```

## State Machine Ownership

Renderer-V2 should own visual state transitions for:

- sector movers
- switches
- texture animation
- light animation
- thing visual frame/state
- voxel/model/sprite binding

Gameplay modules can later drive AI and combat by sending patches.

## Audio Boundary

Music and sounds are parsed and played externally. Renderer-V2 emits events only. Browser audio consumes these events and plays already-parsed assets.
