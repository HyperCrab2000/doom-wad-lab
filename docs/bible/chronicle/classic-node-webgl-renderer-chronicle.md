# Classic Node/WebGL Renderer Chronicle

**Scope:** the attempt to turn GZDoom-style Doom rendering and play into a pure TypeScript / Node-parsed / WebGL2 Classic path.

**Current status:** not complete. The renderer is still visibly wrong in courtyard/window/stair views, and the Classic-vs-GZDoom parity gate still fails badly. Some gameplay systems are now wired into live Classic play, but this is not yet a full Doom engine.

**Important rule learned the hard way:** do not claim a renderer or gameplay fix landed unless a test, browser probe, or pixel capture in the same session proves it.

---

## Terminology

| Term | Meaning in this project |
|------|-------------------------|
| Classic WebGL | The TypeScript browser renderer driven by WAD data parsed by `doom-wad-core` / Node-side worker code. It draws with WebGL2 shaders in `src/wad/renderer/renderGame`. |
| GZDoom gold | The GZDoom-derived WASM/GLES oracle used for pixel comparison. It is a reference, not the desired Classic implementation. |
| GZDoom modular `(s)` | The stripped GZDoom WASM path fed by Node/GZSTATE data. It is used as a renderer oracle and layer reference. |
| Parity gate | The automated Classic-vs-GZDoom capture/diff checks such as `npm run test:classic-gzdoom-parity`. |
| Extras | Voxel enemies/walls, parallax/height/POM, dynamic point lights, colored sector tinting, animated liquid embellishments, and other non-stock additions. These were explicitly shelved for Classic parity work. |

---

## Why this conversion is difficult

This project is not just "draw Doom maps in WebGL." It is a partial reimplementation of decades of GZDoom renderer and game behavior across several coupled systems:

1. **WAD parsing and asset interpretation**
   - Textures are not simple images. Patches, texture definitions, flat lumps, sprites, PLAYPAL, COLORMAP, animated textures, switch textures, sky flats, sidedef offsets, pegging, and transparent/masked midtextures all interact.
   - A single wall can produce upper, lower, and midtexture bands, and those bands may need to be generated for the specific sidedef that the BSP asks to draw.

2. **BSP traversal and visibility**
   - GZDoom does not draw "all sectors in range." It walks BSP subsectors, clips wall spans, and builds draw lists based on the current view.
   - The Classic renderer uses mesh buffers instead of GZDoom's exact `HWWall` / `HWFlat` runtime processing, so it must bridge a mismatch between GZDoom's span-oriented renderer and pre-baked WebGL meshes.

3. **Flats, ceilings, sky, and courtyards**
   - Courtyards are especially hard because sky sectors intentionally create "holes" to sky, but adjacent raised floors/walls must still occlude the right things.
   - Broad "fill the sector" fallbacks hide some holes but cause overdraw, floating floors, x-ray effects, and missing/incorrect stair silhouettes.

4. **Lighting and colormap**
   - GZDoom's look depends heavily on PLAYPAL/COLORMAP, sector light levels, distance visibility, sprite special cases, and subtle `GETPALOOKUP` behavior.
   - Classic currently uses the colormap path, but the math is still not close enough to the oracle; the image remains much brighter/wrong in many captures.

5. **Sprites and psprites**
   - World sprites need sector visibility, frustum culling, depth behavior, direction frames, and correct palette/colormap treatment.
   - Player weapon sprites are screen-space overlays, not normal 3D billboards.

6. **Full-game behavior**
   - Doom playability is not just movement plus doors. It needs use lines, switches, exits, teleporters, pickups, inventory, HUD, cheats, combat, monster thinkers, projectiles, damage, intermission, menu, and audio feedback.
   - Many systems existed as isolated modules/tests, but were not wired into the live Classic loop.

---

## Chronology

### 2025-03 to 2025-06: foundation before GZDoom parity

Earlier project history is covered in [Project history](../../project-history.md) and decision logs in this chronicle. The relevant foundation:

| Date | Progress |
|------|----------|
| 2025-03-16 | Forked a WebGL Doom map renderer and moved to a Vite/React/TypeScript application structure. |
| 2025-03-17 | Extracted `useDoomLoader`, separating React UI from WAD/map loading mechanics. |
| 2025-06 | Split WAD truth into `doom-wad-core` so parser behavior could be reused by Classic, GZSTATE export, and WASM-fed experiments. |

This stage made WADs loadable and drawable, but it was not yet a GZDoom-equivalent renderer.

### 2026-06: GZDoom oracle and layer architecture

| Date | Progress |
|------|----------|
| 2026-06 | Established GZDoom WASM/GLES as the gold oracle for pixel tests. |
| 2026-06 | Added GZDoom `(s)` modular federation: Node parses WAD/GZSTATE, WASM draws with stripped GZDoom renderer. |
| 2026-06 | Split Classic Layer Bible from GZDoom Renderer Bible because TypeScript WebGL and C++ GLES needed different documentation. |
| 2026-06 | Built layer toggles and layer tests for Classic and modular render paths. |
| 2026-06 | Established 68-map corpus gate for the GZDoom WASM renderer track. |

This was the point where the project had a real oracle and could stop relying on screenshots alone.

### 2026-07-03 00:23 UTC-7: reset of rules and scope

The user explicitly reset the task:

- Never claim fixes without testing.
- Shelve voxel enemies/walls/floors, dynamic lighting, slime effects, parallax/POM, and extra enhancements.
- Build the full game in pure Node/TypeScript + WebGL, with no WASM/Emscripten in the Classic target.
- Use GZDoom only as an oracle, not as the shipped Classic renderer.

This changed the work from "make a cool enhanced WebGL map renderer" to "port enough of GZDoom/Doom behavior into a pure WebGL path to be testable against GZDoom."

### 2026-07-03 morning/afternoon: first honest Classic-vs-GZDoom baseline

Work done:

- Added/used Classic-vs-modular capture scripts.
- Fixed capture timing so screenshots wait for play state instead of capturing during load/wipe.
- Added direct WebGL pixel capture for Classic and GZDoom modular canvases.
- Added a new `test:classic-gzdoom-parity` command.

Important verified result:

| Test | Result |
|------|--------|
| `npm run test:classic-layers-matrix` | Passed, but only proved layers are non-empty and toggles work. |
| `npm run test:classic-gzdoom-parity` | Failed badly. Early measurements were roughly `81%` to `88%` mismatch depending capture/crop fixes. |

Lesson: draw counts were not enough. Classic could report walls/flats drawn while still being visually wrong.

### 2026-07-03: shelved extras and parity defaults

Work done:

- Added `src/wad/parity/classicGzdoomParity.ts`.
- Defaulted Classic parity mode to remove:
  - voxels,
  - dynamic point lights,
  - colored lighting,
  - animated liquid embellishment,
  - height/POM relief,
  - VoxelDoom fallback sprite preference.
- Added `?classicExtras=1` as an opt-in escape hatch.
- Added `.cursor/rules/test-before-claim.mdc` to encode the "test before claiming fixed" rule.

Verified result:

| Test | Result |
|------|--------|
| map load cache unit test | Passed after cache-key updates. |
| Classic layers matrix | Passed after some regressions were corrected. |
| Classic parity | Still failed badly. |

### 2026-07-03 afternoon: sprite and psprite fixes

Observed problems:

- Voxel fallback still blocked sprite billboards even when voxels were shelved.
- `PISGA0` was not loaded for the player weapon because it is not a map thing.
- The psprite overlay was oversized and screen-space wrong.

Work done:

- Made an explicit empty voxel catalog authoritative, so Classic parity draws sprites instead of waiting for VoxelDoom definitions.
- Added `PISGA0` to map-scoped asset collection.
- Added screen-space psprite scaling from Doom dimensions instead of a huge hard-coded normalized quad.

Verified results:

| Probe/Test | Result |
|------------|--------|
| Sprite debug counters | `sprites: 25`, `voxelsPending: 0` after voxel fallback fix. |
| Psprite parity test | Mismatch improved from `88.25%` to `87.67%`; mean delta improved from `31.50` to `29.82`. |
| Layers matrix | Passed. |

Status: weapon sprite scale improved, but the renderer remained far from parity.

### 2026-07-03 afternoon/evening: courtyard and stair debugging begins

Observed problems:

- Courtyard walls were see-through.
- Enemies appeared through walls.
- Courtyard liquid/slime/floor surfaces were missing or wrong.
- Some stair/raised-sector flats disappeared.

Work done:

- Added a `classicView=x,y,yawDeg` query to reproduce exact camera views without manual movement.
- Captured E1M1 courtyard/window views and compared live draw stats.
- Added draw stats for flat sectors, flat sector order, and colormap activation.
- Found that sprite visibility only used frustum checks, not sector visibility.

Verified fix:

| Before | After |
|--------|-------|
| Bad courtyard view drew `sprites=108` | Same view drew `sprites=1` (the psprite only) after sector-culling sprites. |

Status: enemy x-ray through walls was substantially reduced for that class of view.

### 2026-07-03 evening: gameplay audit and first live wiring

The user pointed out Classic was not a playable game: doors worked, but switches, exits, teleporters, pickups, Esc menu, cheats, enemy behavior, and HUD were missing or disconnected.

Audits found:

- `src/wad/game/` contained many isolated systems and tests.
- Live Classic play only wired a subset of movement and map actions.
- `DoomHud`, `DoomIntermission`, pickups, inventory, cheats beyond `iddt`, and teleport result application were mostly disconnected.

Work done and verified:

| System | Work | Verification |
|--------|------|--------------|
| Pickups/inventory/HUD | Wired `tryPickups`, `PlayerInventory`, `DoomHud`, hidden picked thing indices. | Browser probe spawned on valid E1M1 health bonus: `pickedCount: 1`, health `101`. |
| Esc menu | Added a minimal Classic pause/menu overlay. | Browser probe verified open/close on Esc. |
| Teleports | Passed player radius into walk-line detection and applied teleport destination to player state. | E1M5 browser probe hit special `97`, `teleport: true`, player moved to teleport destination row. |
| Exits/intermission | Exposed exit request and mounted `DoomIntermission`. | E1M1 exit switch browser probe showed intermission canvas. |
| Cheats | Added live `idkfa`, `idfa`, `iddqd` handling. | Browser probe verified `idkfa` grants armor/ammo/weapons/keys and message. |
| Combat | Wired Ctrl/fire through `playerWeapons` and `playerCombat`; first-pass hitscan damage hides killed targets. | Browser probe fired pistol at barrel: ammo `50 -> 49`, hit thing `37`, killed count `1`, sprites `16 -> 15`. |

Mistake and correction:

- A crude monster movement loop was added and verified as moving monsters.
- The user correctly objected because monsters were moving when they should not, especially while rendering was still wrong.
- That movement path was removed.
- Browser probe verified no `monsterMovedCount` and stable player/debug state afterward.

Status: Classic became more playable, but still not a complete Doom engine. Monster AI, projectiles, attacks, damage/death animations, full menu/options/save, and visual parity remained open.

### 2026-07-04 12:50 UTC-7: renderer pass on psprite and lighting

Work done:

- Confirmed `gzdoomColormap: true` in Classic draw stats for parity captures.
- Tried a shader shade-offset adjustment, but it did not affect measured output and was reverted.
- Fixed psprite scale/position as described above.

Verified result:

| Test | Result |
|------|--------|
| `npm run test:classic-layers-matrix` | Passed. |
| `npm run test:classic-gzdoom-parity` | Improved to `87.67%` mismatch, still failed. |

Status: psprite better; lighting/colormap still very wrong.

### 2026-07-04 afternoon: courtyard high-side wall bands

Observed problem:

For E1M1 courtyard sky-step lines `127`, `128`, and `129`, generated wall geometry existed only on one sidedef. BSP draw entries requested the opposite sidedef, so the renderer skipped those bands and showed sky through walls.

Evidence:

| Line | BSP requested side | Geometry before fix |
|------|--------------------|---------------------|
| `127` | `170` | only side `171` |
| `128` | `172` | only side `173` |
| `129` | `174` | only side `175` |

Work done:

- Added high-side sky-step wall band generation in `mapToWalls.ts`.
- Added a regression assertion in `mapToWalls.test.ts`.
- Bumped map geometry cache version.

Verified result:

| Capture/View | Before | After |
|--------------|--------|-------|
| `window43-south` | `walls=38` | `walls=41` |
| `stair-east-a` | `walls=70` | `walls=76` |
| `stair-east-b` | `walls=70` | `walls=76` |
| `stair-window41` | `walls=120` | `walls=126` |

Tests:

- `mapToWalls.test.ts`: passed.
- `mapLoadCache.test.ts`: passed.
- `test:classic-layers-matrix`: passed.

Status: closed a real category of sky leaks. Did not solve all courtyard/stair rendering.

### 2026-07-04 afternoon: flat supplement separation

Observed problem:

The renderer needed sector-level flat supplements to fill cracks where BSP subsector flat meshes missed surfaces, but the broad supplement was also overdraw-prone.

Specific issue:

- In the E1M1 stair/window view, sector `41` had valid baked flat geometry but never reached the browser draw path.
- `flatSectorOrder` in browser draw stats omitted `41`, while the intended mesh-visible sector set included it.

Work done:

- Added `flatSupplementSectorOrder` to `GzdoomDrawState`.
- Kept strict `visibleSectors` / `flatSectorOrder` invariants intact for BSP correctness.
- Used the separate supplement list only in `renderGzdoomFlats` to fill renderer cracks.

Tests:

- First attempt broke courtyard invariants by polluting `visibleSectors`; tests failed.
- Fixed by separating supplement sectors from strict draw-state sectors.
- Reran:
  - `gzdoomDrawState.test.ts`: passed.
  - `courtyardVisibility.test.ts`: passed `21/21`.

Verified result:

| Browser stair/window draw stats | Before | After |
|---------------------------------|--------|-------|
| Drawn flat sectors | `[1,12,32,42,44,47,48]` | `[1,12,32,41,42,43,44,46,47,48]` |
| Flat draw count | `37` | `43` |

Status: more valid stair/window sectors now draw. Still visually wrong in some foreground/edge areas.

---

## Current verified state

### Renderer

| Area | Status |
|------|--------|
| WAD parsing | Classic uses Node/worker-side WAD parsing through project WAD loaders and `doom-wad-core` style data flow. |
| Walls | Many sidedef/height cases work; high-side sky-step bands were added for E1M1 courtyard lines. Still not fully GZDoom-equivalent. |
| Flats | Subsector BSP flats plus renderer-only full-sector supplements. This fixes some holes but is still a compromise and not line-for-line GZDoom `HWFlat`. |
| Sky/courtyard | Better than baseline, but still visibly wrong in several views. |
| Sprites | Sector-culling added; VoxelDoom fallback disabled in parity mode; sprites render as billboards. |
| Psprite | Pistol overlay now closer in scale, but not exact. |
| Lighting/colormap | GZDoom colormap path is active, but output remains much too different from GZDoom. |
| Parity | `npm run test:classic-gzdoom-parity` still fails around `87.67%` mismatch for E1M1 spawn. |

### Gameplay

| Area | Status |
|------|--------|
| Movement/collision | Present, but not full Doom physics. |
| Doors/switches/floors | Many map actions are wired and tested. |
| Teleports | Live teleport result application verified on E1M5. |
| Exits/intermission | Exit switch -> intermission verified on E1M1. |
| Pickups/inventory/HUD | Live pickup and HUD state verified. |
| Cheats | `iddt`, `idkfa`, `idfa`, `iddqd` partially wired. |
| Combat | First-pass hitscan fire consumes ammo and can kill/hide simple targets. |
| Monster AI | Not implemented. A crude movement attempt was removed because it was wrong. |
| Full menu/save/options | Not implemented; only minimal Esc pause overlay exists. |

---

## Most important verified commands

These are the commands repeatedly used to separate fact from hope:

```sh
npm run test:classic-layers-matrix
npm run test:classic-gzdoom-parity
npm run test:unit -- src/wad/renderer/bsp/gzdoomDrawState.test.ts src/wad/renderer/courtyard/courtyardVisibility.test.ts
npm run test:unit -- src/wad/renderer/geometry/mapToWalls.test.ts src/wad/renderer/renderGame/mapLoadCache.test.ts
npm run test:unit -- src/wad/game/playerCombat.test.ts src/wad/game/playerWeapons.test.ts src/wad/game/pickupSystem.test.ts src/wad/game/doomCheats.test.ts src/wad/game/teleportSystem.test.ts src/wad/game/exitSystem.test.ts
```

Representative browser probes were also run with Puppeteer and `classicView` / `classicStart` query parameters to verify:

- E1M1 health bonus pickup.
- Esc menu open/close.
- E1M5 teleporter.
- E1M1 exit switch -> intermission.
- Pistol fire against a barrel.
- E1M1 courtyard/window/stair draw stats.

---

### 2026-07-07: HUD regression + load blocker

Observed problem:

- Classic play showed broken HUD (stretched STBAR, missing face) and textures flashing.
- Parity gate and all Puppeteer captures timed out at `waitClassicPlaying`.

Root cause:

- `DoomHud.tsx` imported `drawPatchImage` from `drawPatch.ts`, but that export did not exist — **page error blocked the entire app from loading**.
- Classic play used full-canvas WebGL layout, drawing 3D under the HUD overlay and skewing colormap glob-vis scale.

Work done:

| Fix | File |
|-----|------|
| Added `drawPatchImage` + `PatchImage` (patch anchor offsets) | `drawPatch.ts` |
| Vanilla HUD layout (STBAR, STF face aliases, STTNUM health/armor) | `DoomHud.tsx` |
| GZDoom screenblocks-10 play layout + status bar band clear | `renderGame.ts` |
| Geometry cache v17 | `mapLoadCache.ts` |

Verified:

- `scripts/repro-e1m1-load.mts`: `ok: true`, `isPlaying: true` in ~4s.
- `npm run test:classic-gzdoom-parity`: **78.56%** mismatch (42232/53760 px) — gate still fails; no regression vs prior session.

Status: app loads and plays again; pixel parity **78.51%** after mid/lower peg fix; mid-upper bucket still worst at **92.9%**.

### 2026-07-07 continued: peg flags + sector damage

- Mid/lower/one-sided wall UV pegging aligned with GZDoom `DoTexture` (`drawFromTop = lowerUnpegged` for mid/lower).
- Wired `applySectorEffects` into Classic play (nukage damage, heal sectors, powerup damage block).
- Geometry cache v18; gate **78.51%** (42207 px).

### Renderer priorities

1. Replace the current flat supplement compromise with a closer GZDoom `HWFlat::ProcessSector` / subsector-span equivalent.
2. Fix courtyard sky/floor/wall occlusion without broad full-sector overdraw.
3. Fix PLAYPAL/COLORMAP shade and visibility math against GZDoom.
4. Audit wall pegging, sidedef offsets, and top/bottom band generation against GZDoom `HWWall::Process`.
5. Add dedicated browser image gates for the exact courtyard views that keep regressing, not just E1M1 spawn.

### Gameplay priorities

1. Replace first-pass hitscan with real Doom weapon spread, damage, range, and state timing.
2. Add monster thinkers only after renderer visibility is trustworthy.
3. Add player damage, enemy attacks, death, and respawn/restart behavior.
4. Build a real Doom menu/options/save flow, not just a pause overlay.
5. Add Classic play E2E tests for switch, teleporter, pickup, exit, combat, and menu flows.

---

## Bottom line

The Classic renderer has moved from "broken map viewer with some layers" to "Node-parsed WebGL play path with partial gameplay and better courtyard/stair coverage." That is real progress, and it is now backed by browser probes and tests.

But the conversion is still far from a faithful GZDoom-to-pure-WebGL renderer:

- pixel parity is still very poor,
- lighting/colormap is still wrong,
- courtyards still have visible geometry issues,
- full Doom gameplay is still incomplete,
- and the current renderer still relies on compromises that need to be replaced with closer GZDoom logic.

The hard part is not one bug. The hard part is that every visible frame is the product of WAD semantics, BSP traversal, mesh generation, draw order, palette math, gameplay state, and UI overlays. Each subsystem can be "mostly working" while the final image remains obviously wrong.

---

[← Project Chronicle](./README.md)
