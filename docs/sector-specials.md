# Sector specials — lighting, damage, wind, scrollers

Sector `type` values are cataloged in `src/wad/constants/SectorSpecials.ts` (Doom 1 + Doom 2 / extended rows). Runtime behavior lives in:

| Module | Role |
|--------|------|
| `sectorSpecialRegistry.ts` | Per-type catalog + implementation status |
| `sectorSpecialRuntime.ts` | Damage, wind, scroll, friction, healing lookups |
| `sectorSpecialSystem.ts` | Timed ceiling doors (types 10, 14, 74, 78) |
| `sectorDynamicLight.ts` | Blink / strobe / flicker / lightning (rendering) |
| `applySectorTypePresentation` | Liquid tint + outdoor fog hints at map load |

## Implementation status

- **104** unique sector types in the merged catalog (`getSectorCatalogCoverageStats()`).
- **Line specials** remain separate (`lineSpecialRegistry.ts`); sector type **26/27** only mark stair-builder sectors for line special **8** / **7**.

## Gameplay (player movement)

`getSectorPlayerEffects()` is applied each tick in `doomPlayerControls`:

- **Wind** (40–51): constant push by direction/strength.
- **Scroll** (84, 118, 201–244): same push model as wind; type **118** uses sector `tag` for angle.
- **Friction** (79): lower ground friction.
- **Damage** (4–7, 11, 16, 68–85, 105, 115–116): exposed as `damagePercentPerSecond` / `instantKill` (no player health UI yet).
- **Healing** (196): `healPerSecond` for future HUD wiring.
- **Secret** (9): `isSecret` flag.

## Rendering

- Dynamic sector light levels: types **1–3**, **8**, **12–13**, **17**, **65–68**, **72**, **76–77**, **81**, **84**, **197–199**.
- **87**: stronger fog density at load.
- Damage types without nukage/lava flats still get `liquidKind` for visuals.

## Timed doors

Types **10** / **74**: 30s after level start, ceiling closes to floor.  
Types **14** / **78**: 300s after start, ceiling opens upward.

Driven by `SectorSpecialSystem` inside `MapActionController.tick`.

## Tests

- `sectorSpecialRegistry.test.ts` — catalog completeness
- `sectorSpecialBehaviors.test.ts` — runtime + timed doors
- `sectorDynamicLight.test.ts` — lighting modulation

```bash
npm run test:unit -- src/wad/game/sectorSpecial
```
