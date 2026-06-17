# Corpus Testing

**Last updated:** 2026-06-17

## Scope

MAP01/E1M1 is a **smoke** test only. Production parity requires **all supported maps** in configured IWAD fixtures:

- `DOOM.WAD` — 27 maps (E1–E4, episodes)
- `DOOM2.WAD` — 32 maps (MAP01–MAP32)
- **68 maps total**

Future: TNT.WAD, PLUTONIA.WAD, user PWAD fixtures.

## Gates

| Gate | Description | Status |
|------|-------------|--------|
| 1 | Single-map smoke (E1M1, MAP01) | Closed |
| 2 | All maps in first target WAD | Closed |
| 3 | Full IWAD corpus (DOOM + DOOM2) | **Closed** (`npm run test:corpus`) |
| 4 | User PWAD / mod stacks | Open — `mod:parity`, `test:mod-parity` |
| 5 | Regression on every parser/exporter change | Policy |

## Corpus runner

**CLI:** `tools/gzrender-v2/corpus-parity.mts`

```bash
npm run corpus:parity:static -- public/wads/DOOM.WAD
npm run corpus:parity:all
```

Capabilities:

- Discover maps in WAD
- Export GZDoom GZSTATE (`-dumpgzstate`)
- Export Node GZSTATE (`exportToGzstate`)
- Diff state (`assertFullParity`)
- Optional static WAD round-trip verify
- Write `summary.json` per IWAD slug

**Vitest gate:** `src/wad/parity/corpus.parity.test.ts`

```bash
GZRENDER_CORPUS_REQUIRED=1 npm run test:corpus
```

Uses `parallelMap` over maps per IWAD (~18s local). Requires:

```text
public/wads/DOOM.WAD
public/wads/DOOM2.WAD
artifacts/gzrender-v2/corpus/DOOM/<MAP>/gzdoom.gzstate
artifacts/gzrender-v2/corpus/DOOM2/<MAP>/gzdoom.gzstate
```

Optional per map: `gzdoom-static.gzstate` (static WAD verify).

## Artifacts (per WAD/map)

```text
artifacts/gzrender-v2/corpus/<SLUG>/<MAP>/
  gzdoom.gzstate           # GZDoom dump (required)
  gzdoom-static.gzstate    # static verify (required when GZRENDER_CORPUS_REQUIRED=1)
  summary.json             # at <SLUG>/ level
```

Frame artifacts (separate from GZSTATE corpus):

```text
artifacts/gzrender-v2/gzdoom/E1M1.png
artifacts/gzrender-v2/wadlab/E1M1.png
```

## Reports

| File | Content |
|------|---------|
| `summary.json` | `mapCount`, `pass`, `fail`, `staticVerify` |
| Per-map folders | State dumps, future frame diffs |
| [parity-gap-tracker.md](./parity-gap-tracker.md) | Classified open gaps |

## Regeneration workflow

```bash
# 1. Rebuild GZDoom if exporter changed
cd ../../gzdoom-project && <build>

# 2. Regenerate corpus
cd ../doom-wad-lab
npm run corpus:parity:all

# 3. Verify
npm run test:corpus
cd ../doom-wad-core && npm test
```

## Related

- [TESTING.md](../TESTING.md) — parallelization, env vars
- [test-matrix.md](./test-matrix.md) — all layer commands
- [../../docs/TESTING.md](../../docs/TESTING.md) — workspace overview
