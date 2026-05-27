# Game content — sounds, music, sprites, story, mechanics

How **doom-wad-lab** reverse-engineers and inventories vanilla Doom / Doom II content from IWADs, and how that relates to gameplay systems already in the repo.

## Quick audit (local)

With `DOOM2.WAD` or `DOOM.WAD` under `public/wads/`:

```bash
npx tsx scripts/audit-wad-content.ts public/wads/DOOM2.WAD
```

This prints story lumps, music/sound counts, per-category SFX totals, and a sample map’s thing list (type → sprite → description).

## WAD asset catalog API

**Module:** `src/wad/catalog/wadAssetCatalog.ts`

`buildWadAssetCatalog(wad)` scans a parsed `Wad` and returns:

| Section | Source | Use |
|---------|--------|-----|
| **maps** | `wad.maps` + `doomMusic` | Per-map thing histogram, music lump resolution |
| **sounds** | `DS*` lumps in `lumpHash` | Decode probe via `decodeDoomSound` |
| **music** | `D_*` lumps | MUS header check (`MUS\x1a`) |
| **sprites** | `wad.sprites` + `createSpriteIndex` | Sprite root → frames → lump names |
| **flats / textures** | `wad.flats`, `wad.textures` | Names only (geometry uses these elsewhere) |
| **storyTexts** | `TEXT*`, `HELP*`, `CREDIT`, … | Screen count + preview (`parseDoomTextScreens`) |
| **dmusinfo** | Optional `DMUSINFO` lump | Map → music pairs (`parseDmusinfo`) |
| **demos** | `DEMO1`… | Lump names |

Lump classification: `src/wad/catalog/categorizeLump.ts`.

## Sounds

| Layer | Location |
|-------|----------|
| **Decode** | `src/features/level-viewer/sfx/doomSfxPlayer.ts` — formats 0, 3, raw 8-bit |
| **Play** | `DoomSfxPlayer` — Web Audio, cached buffers |
| **Door/action SFX** | `DOOM_DOOR_SOUNDS` — wired from `MapActionController` in the viewer |
| **Registry labels** | `src/wad/catalog/doomSoundRegistry.ts` — weapon / monster / door / world |

Every `DS*` lump in the IWAD is listed by the catalog; known names get a category, others are `other`.

## Music

| Layer | Location |
|-------|----------|
| **MUS decode** | `src/features/level-viewer/music/doomMusic.ts` |
| **MUS → MIDI** | `mus2midi.ts` + SpessaSynth SoundFont |
| **Map → track** | `doom2MusicByMap`, Ultimate Doom E4 table, `getMusicLumpCandidatesForMap` |
| **Optional override** | `DMUSINFO` lump (mods / some PWADs) — parsed when present |

See [mus-music.md](./mus-music.md) for pitch-bend and playback detail.

## Sprites

| Layer | Location |
|-------|----------|
| **WAD lumps** | Between `S_START` / `S_END` → `wad.sprites` at parse time |
| **Frame index** | `src/parser/wad/createSpriteFrame.ts` — `POSSA1` → sprite `POSS`, frame, direction |
| **Thing → sprite** | `src/wad/constants/doomThingMap.ts` — radius, kind, `SPR` name, description |
| **Render** | `drawScene.ts` — billboard sprites + optional KVX voxels ([voxels.md](./voxels.md)) |
| **Catalog** | `buildSpriteInventory` in `wadAssetCatalog.ts` |

`thingTypeIndex.ts` exposes `getThingTypeById` and `summarizeMapThings` for map audits.

## Story & UI text

Vanilla story/help lumps use **screens separated by a line containing only `_`**:

- `TEXT1`–`TEXT6` — episode endings (Doom / Ultimate Doom)
- `HELP1`, `HELP2`, `CREDIT`
- Intermission patches: `P_*` lumps (graphics, not parsed as text here)

Parser: `src/wad/catalog/parseDoomText.ts`.

`ENDOOM` is stored on the `Wad` object as raw bytes (`enddoom`) for future terminal rendering.

## Game mechanics (runtime)

| System | Doc | Implementation |
|--------|-----|----------------|
| **Line specials** | [line-specials.md](./line-specials.md) | Doors, floors, lifts, crushers, stairs, teleports, keys, scroll, moving floors |
| **Collision / movement** | [rendering.md](./rendering.md) | `doomCollision.ts`, player controls |
| **Sector specials** | [sector-specials.md](./sector-specials.md) | Wind, friction, scroll, **floor damage/heal**, timed doors |
| **Player / HUD** | `playerInventory.ts`, `DoomHud.tsx`, `statusFace.ts` | Health, armor, ammo, **STF face**, keys, center messages |
| **Weapons** | `playerWeapons.ts`, `playerCombat.ts` | Click/hold fire, 1–8 select, ammo use, gun triggers |
| **Powerups** | `playerPowerups.ts` | Timed invuln, berserk, invis, rad suit, light amp, automap flag |
| **Pickups** | `pickupSystem.ts`, `pickupDefinitions.ts` | Touch pickup (no collision), status text, item removal |
| **Things** | This doc + `doomThingMap.ts` | Spawn types, kinds; **no** full mobj AI yet |
| **Demos** | Catalog only | Lumps present; playback not implemented |

## References (Doom)

- [Doom Wiki — linedef types](https://doomwiki.org/wiki/Linedef_type)
- [Doom Wiki — MUS](https://doomwiki.org/wiki/MUS)
- [Doom Wiki — sound lumps](https://doomwiki.org/wiki/Sound)
- Project tables: `LineDefSpecials.ts`, `lineSpecialRegistry.ts`, `doomThingMap.ts`

## Tests

| Test | Scope |
|------|--------|
| `src/wad/catalog/wadAssetCatalog.test.ts` | Parsers + minimal synthetic WAD |
| `test/integration/wad-content.integration.test.ts` | Full IWAD inventory (skipped without `DOOM2.WAD`) |
