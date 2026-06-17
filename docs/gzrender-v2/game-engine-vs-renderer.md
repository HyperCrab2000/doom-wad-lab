# Game Engine vs Level Renderer

## The distinction you identified is correct

What exists today in this monorepo is **not** a GZDoom game engine WASM port. It is a **level renderer + static state pipeline**:

| Layer | What GZDoom has | What we have today | Repo / artifact |
|-------|-----------------|-------------------|-----------------|
| **Asset / map parse** | Full FS, PK3, MAPINFO | IWAD/PWAD merge, vanilla parse | `@hypercrab2000/doom-wad-core` |
| **Post-load render state** | Internal level structs | **GZSTATE v1** export/import | `doom-wad-core`, GZDoom `-dumpgzstate` |
| **Draw / GPU** | HW renderer (OpenGL/Vulkan) | Classic WebGL2 + 278-byte WASM stub | `doom-wad-lab` `drawScene`, `gzrender_federated.wasm` |
| **Tick simulation** | `P_Ticker`, thinkers, states, AI | Partial **TypeScript** vanilla specials only | `doom-wad-lab/src/wad/game/*` |
| **Scripting** | ZScript, ACS, DECORATE | None | — |
| **Actors / inventory / combat** | Full mobj system | Subset (doors, lifts, pickups) | Not GZDoom-parity |

**GZSTATE** answers: *“What does the world look like immediately after map load?”*  
It does **not** answer: *“What happens on tick 847 when the player fires the shotgun at a sergeant?”*

Those require a separate **game engine WASM** process (or module) derived from GZDoom’s simulation code, not from the renderer strip path.

## Two WASM processes (target architecture)

```text
┌─────────────────────────────────────────────────────────────────┐
│  Browser / Node host (doom-wad-lab shell)                        │
│  - input, audio, HUD, networking (future)                        │
│  - loads IWAD/PWAD/PK3 via doom-wad-core                         │
└───────────────┬─────────────────────────────┬───────────────────┘
                │                             │
                ▼                             ▼
┌───────────────────────────┐   ┌───────────────────────────────┐
│  gzengine-core.wasm        │   │  gzrender-core.wasm              │
│  (GAME ENGINE)             │   │  (LEVEL RENDERER)              │
│  - map setup / thinkers    │   │  - import GZSTATE + patches    │
│  - mobj tick / states      │   │  - BSP visibility / draw lists │
│  - line specials (GZDoom)  │   │  - WebGL2 backend (JS or WASM) │
│  - damage, pickups, AI     │   │  - voxels / sprites / flats    │
│  - ACS/ZScript (later)     │   │  - emit render events          │
│  - exports GZTICK snapshots│   │  - consumes thing/sector patches│
└───────────────┬───────────┘   └───────────────▲───────────────┘
                │                               │
                │  GZTICK + patch stream per tick │
                └───────────────────────────────┘
```

Principles (from [federation-model.md](./federation-model.md)):

- Renderer **must not** absorb the whole game engine.
- Engine **must not** own GPU draw details.
- Both sides agree on **binary wire formats** (GZSTATE at load, GZTICK + patches per tick).

## What “100% parity + 100% test coverage” can mean (honestly)

| Claim | Achievable? | How |
|-------|-------------|-----|
| 100% GZDoom **source** line coverage in WASM | **No** | GZDoom is millions of LOC + unbounded mod scripts |
| 100% **GZSTATE** on stock IWAD maps @ load | **Yes** | Closed: 68/68 (`npm run test:corpus`) |
| 100% **GZTICK** on fixture scenarios | **Yes, in principle** | Deterministic tick dumps from GZDoom fork vs WASM engine |
| 100% **frame** parity | **Fixture maps + mod stacks** | PNG diff corpus, not every PWAD ever made |
| 100% **ZScript/mod** parity | **No exhaustive** | Fixture PK3s + representative ACS/ZScript corpus |

**Test strategy for the engine** (mirrors renderer charter):

1. **Unit** — GZTICK reader/writer, patch codec, fixed-point math helpers  
2. **Tick parity** — GZDoom `-dumpgztick` vs WASM `exportGztick()` @ tick N for fixture replays  
3. **Event parity** — same inputs → same sound/sector/thing events (ordered log diff)  
4. **Integration** — engine WASM + renderer WASM in headless browser; frame diff optional  
5. **Corpus** — grow scenario fixtures (E1M1 doors, MAP07 platforms, demo1 replay slice, …)

## Relationship to doom-wad-lab TypeScript `src/wad/game/`

The existing TS game code is a **vanilla Doom subset** for the level viewer (doors, lifts, pickups, line specials). It is useful for walking sim but is **not** GZDoom and must **not** be mistaken for the WASM engine target.

Migration path:

- Keep TS specials as **fallback / classic mode** in WAD Lab.
- New **GZEngine mode** drives the renderer via GZTICK + patches from `@hypercrab2000/doom-gzengine-core` WASM.
- Parity tests always compare against **GZDoom fork dumps**, not against TS game code.

## Published packages (proposed)

| Package | Role |
|---------|------|
| `@hypercrab2000/doom-wad-core` | WAD parse + **GZSTATE** export (exists) |
| `@hypercrab2000/doom-gzengine-core` | **GZTICK** types, patch codec, WASM host API (new repo) |
| `@hypercrab2000/doom-gzrender-core` | Renderer WASM host + GZSTATE consumer (future split from lab) |

Repo layout on disk:

```text
IdeaProjects/
  doom-wad-core/          ← assets + GZSTATE (published)
  doom-gzengine-core/     ← game engine WASM + GZTICK (new)
  doom-wad-lab/           ← browser app, Classic renderer, parity harness
  gzdoom-project/         ← fork: -dumpgzstate, -dumpgztick (to add)
```

## GZDoom source extraction order (engine)

Do **not** port all of GZDoom at once. Order matches how GZDoom actually runs:

```text
1. Level load already covered by GZSTATE (shared with renderer)
2. Thinker list + sector movers (visual-critical)
3. Line activation / switches / doors (GZDoom semantics, not vanilla-only)
4. Mobj spawn, states, sprites (actor framework)
5. Player command → p_user (movement, weapons)
6. Monster AI (minimal set: zombie, sergeant, imp for corpus)
7. Projectiles + damage
8. ACS (bytecode VM subset)
9. ZScript (separate VM; mod parity fixtures only)
```

Each gate adds **GZTICK sections** and **corpus fixtures** before the next layer.

## Immediate next steps

| Step | Owner repo | Gate |
|------|------------|------|
| GZTICK v0 spec + TS types | `doom-gzengine-core` | Schema frozen |
| GZDoom `-dumpgztick` @ tick N | `gzdoom-project` | E1M1 t=0 matches load |
| Emscripten build of stripped `p_tick` path | `doom-gzengine-core` | t=35 door press fixture |
| Patch stream TS ↔ WASM | both | renderer moves sectors from engine |
| Close E1M1 **frame** parity (renderer) | `doom-wad-lab` | Gate B (prerequisite for combined tests) |

## Commands (today vs future)

**Today (renderer state only):**

```bash
npm run test:corpus          # GZSTATE 68 maps
npm run test:modular         # draw stages @ spawn
```

**Future (engine + renderer):**

```bash
# doom-gzengine-core
npm test                     # GZTICK codec + tick fixtures
npm run corpus:tick          # GZDoom vs WASM tick parity

# doom-wad-lab
npm run test:engine-render   # federated engine WASM + renderer WASM integration
```

**Testing docs:** [docs/TESTING.md](../docs/TESTING.md) · [../../docs/TESTING.md](../../docs/TESTING.md)

## Browser UI integration (doom-wad-lab)

The Level Viewer already loads **WAD + music independently**. Federated mode plugs in without changing that:

```text
useDoomLoader
  → fetchWadStack(iwad, ?mods)     # doom-wad-core parse
  → renderGame.load(wad, map, …)   # GPU buffers + federated runtime

useLevelMusic(wad, map, wadPath)     # unchanged — OPL3 / WebAudio sidecar

GzFederatedRuntime.loadMap()
  → exportToGzstate(wad, map)      # shared wire bytes
  → renderer WASM validate           # gzrender_federated.wasm
  → engine WASM load (or TS fallback)

each frame:
  → runtime.advanceFrame()           # engine tick → GZTICK patches
  → mapActions / sector refresh      # TS bridge today
  → drawScene / federated WASM draw  # renderer
```

URL params:

```
?renderer=wasm-federated
?engine=typescript    # default — TS MapActionController
?engine=wasm          # use gzengine WASM when built (falls back to TS)
?mods=/mods/foo.wad
```

HUD shows: `Federated · engine TS + renderer WASM · E1M1 · …`

## See also

- [federation-model.md](./federation-model.md) — thing patches, AI outside renderer  
- [project-charter.md](./project-charter.md) — renderer pipeline order  
- [gzstate-v1.md](./gzstate-v1.md) — load-time render state  
- `../doom-gzengine-core/docs/GZTICK-v0.md` — tick-time engine state (new repo)
