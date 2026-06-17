# GZRender-V2 Handoff

**Session:** 2026-06-16 — Stage 1 complete, Stage 2 started  
**Repo:** `/Users/williamfarmer/IdeaProjects/doom-wad-lab`  
**Branch:** `feature/gzrender-v2`

## Summary

Stage 1 is done: GZDoom exports post-load GZSTATE for E1M1 and can capture a reference PNG in the same run. TypeScript reader validates the real dump fixture. Next work is the import renderer in `renderer-v2/`.

## Confirmed configuration

| Item | Value |
|------|-------|
| WAD Lab | `/Users/williamfarmer/IdeaProjects/doom-wad-lab` |
| GZDoom | `/Users/williamfarmer/IdeaProjects/gzdoom-project` |
| GZDoom build | `tools/gzrender-v2/build-gzdoom.sh` |
| GZDoom binary | `build/gzdoom.app/Contents/MacOS/gzdoom` |
| First WAD | `public/wads/DOOM.WAD` |
| First map | E1M1 |
| Corpus | `public/wads/` |

## Artifacts (E1M1)

| File | Size | Notes |
|------|------|-------|
| `artifacts/gzrender-v2/gzdoom/E1M1.gzstate` | 78582 B | 537 verts, 88 sectors, 486 lines |
| `artifacts/gzrender-v2/gzdoom/E1M1.png` | ~5.9 MB | GZDoom reference frame (resolution TBD) |

## Immediate next steps

1. Scaffold native OpenGL import renderer in `renderer-v2/`.
2. Load `E1M1.gzstate`, render one frame at player spawn.
3. PNG diff vs `E1M1.png`.
4. Pin screenshot to 640×480 (cvars may apply after window init).

## Commands

```bash
# Build GZDoom + pk3
tools/gzrender-v2/build-gzdoom.sh

# Dump state only (fast exit at P_SetupLevel)
tools/gzrender-v2/dump-gzdoom-state.sh

# Dump state + reference PNG
tools/gzrender-v2/capture-gzdoom-ref-frame.sh

# Inspect dump
npx tsx tools/gzrender-v2/diff-gzstate.ts artifacts/gzrender-v2/gzdoom/E1M1.gzstate

# GZSTATE tests (includes E1M1 fixture)
npm run test:unit -- gzstate/gzstate.test.ts
```

## Protection rule

New work only in `renderer-v2/`, `gzstate/`, `tools/gzrender-v2/`, `docs/gzrender-v2/`, `artifacts/gzrender-v2/`.
