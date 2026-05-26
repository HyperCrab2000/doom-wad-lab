# Line specials — doors, switches, movers

Runtime line-special handling is modeled on **Doom `p_spec`** behavior (see also `LineDefSpecials.ts` in the repo for the full catalog).

## Player activation

| Input | Behavior |
|-------|----------|
| **E** or **left click** | `findUseLine` — range **64** (Doom `USERANGE`), **front side** only, prefers lines within **90°** of view yaw |
| **Walk over** | `findCrossedWalkLines` — segment intersection, no facing check |

`MapActionController` dispatches to:

- **`DoorSystem`** — ceiling movers (manual + tagged doors)
- **`FloorMoverSystem`** — lifts, floor raise/lower, ceiling movers

## Switch visuals

On trigger, sidedef textures flip **SW1↔SW2** / **DB1↔DB2** and the activating linedef’s walls are refreshed.

## Implemented mover specials (subset)

| Group | Examples | Notes |
|-------|----------|--------|
| Doors | 1, 2–4, 16, 26–34, 42, 50, 61, 63, 75–76, 86, 90, 103, 105–118 | Slow vs turbo speeds |
| Lifts | 10, 21, 62, 88, 120–123 | Down → wait → up |
| Floors | 5, 23, 38, 60, 64, 82, 91, 101 | Raise to lowest adjacent ceiling − 8, or lower to neighbor floor |
| Ceilings | 40–44, 49, 72 | Raise HEC / lower to floor (+8) |

## Not yet implemented

Stairs (7, 8, 100, 127), crushers (6, 25, 57, …), donuts (9), teleports, exits, gun lines, keyed doors, scrollers (48). See `LineDefSpecials.ts` for the full list.

## Live geometry

When heights change, dirty sectors refresh **walls and flats** (`refreshDoorWallGeometry` → `syncFlatsForDirtySectors`) so door pockets gain floor/ceiling polygons as they open.

## Sector lighting

Sector types **4, 12, 13, 17** apply dynamic light strobes/flicker at draw time (`sectorDynamicLight.ts`).
