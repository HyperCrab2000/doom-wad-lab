# Agent Notes — Doom WAD Lab only

This repository is **Doom / Doom II IWAD tooling only** (WebGL viewer, line specials, MUS/SFX from WAD lumps).

Do **not** add Yserbius, Twinion, MedievaLands, or `RESOURCE.*` game data here. That work belongs in **`yserbius_twinion_web`** (`/Users/williamfarmer/IdeaProjects/yserbius_twinion_web`).

## Door / switch USE fix (2026-05-25)

Left-click and **E** were not activating doors/switches reliably. Fixed in:

- `src/wad/game/useLines.ts` — Doom-accurate `P_PointOnLineSide` (cross product from v1), `USERANGE` Manhattan distance (64 units), optional yaw preference for switch linedefs.
- `src/wad/renderer/controls/doomPlayerControls.ts` — USE fires **immediately** on left click (do not wait for pointer lock); **E** key also triggers USE; passes player yaw into `findUseLine`.
- `src/features/level-viewer/LevelViewer.tsx` — controls hint: `Click/E use`.

Walk-over door linedefs (specials 2, 4, etc.) still trigger via `findCrossedWalkLines` when the player crosses the line.

Tests: `src/wad/game/useLines.test.ts`, `src/wad/game/doorSystem.test.ts`.

Do not revert the “use before pointer lock” behavior — first click must open doors without requiring mouse capture first.
