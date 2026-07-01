# WASM GZDoom — Gold oracle vs modular (s) fork

Two browser backends, two jobs. Do not conflate them.

## Gold — `gzdoom-wasm` (frozen parity oracle)

**Job:** Prove that GZDoom’s own GLES HW renderer, compiled to WASM, matches native gold at **0% playfield diff** on all 68 stock maps.

| Property | Value |
|----------|-------|
| UI backend id | `gzdoom-wasm` |
| Artifact | `public/wasm/gzdoom/{gzdoom.js,gzdoom.wasm,*.pk3}` |
| Build | `npm run build:gzdoom-wasm` → `tools/gzrender-v2/build-gzdoom-wasm.sh` (**Emscripten / `emcc`**) |
| WAD input | **Raw IWAD bytes** mounted in MEMFS — GZDoom parses every lump internally (`W_Init`, `P_SetupLevel`) |
| Host | `createGzdoomModule` + MEMFS + `callMain(argv)` — host never draws pixels |
| Play argv | `-gzrender_play -gzrender_browser` + raw `-iwad /wad/DOOM.WAD` |
| Gate | `npm run test:gzdraw-corpus` / spawn-frame diff vs `ref.png` |

Emscripten is **allowed and expected** for gold. The output is still **pure `.wasm` machine code** — Emscripten is only the linker/glue layer (`gzdoom.js` loads the module, provides MEMFS/SDL/WebGL proc table). All rendering stays inside GZDoom C++ GLES → WebGL2.

**Do not modify gold behavior** except parity fixes on the frozen path. Gold is the reference photograph.

## Modular — `gzdoom-s-wasm` (stripped pure-WASM fork)

**Job:** Same GZDoom GLES renderer, but compiled **without Emscripten**, fed **Node-parsed lumps/GZSTATE**, and **stripped subsystem-by-subsystem** so each HW draw pass can be toggled and compared against Classic WebGL while fixing parity.

| Property | Value |
|----------|-------|
| UI backend id | `gzdoom-s-wasm` |
| Artifact | `public/wasm/gzdoom-s/gzdoom.wasm` (+ pk3s; **no `gzdoom.js`**) |
| Build | `npm run build:gzdoom-s-wasm` → `tools/gzrender-v2/build-gzdoom-s-pure-wasm.sh` (**clang → wasm32**, not `emcc`) |
| WAD input | Node `doom-wad-core` parses IWAD → **NODE_LUMPS.WAD** (re-encoded lump archive) + **GZSTATE** per map |
| Map geometry | `-loadgzstate /wad/E1M1.gzstate` — no MAP lump re-parse in engine |
| Host | `WebAssembly.instantiate` + custom WASI/browser shims (`gzdoomPureWasmHost.ts`) |
| Play argv | `-gzrender_play -gzrender_browser -gzrender_s -loadgzstate …` |
| Gate | E1M1 play smoke; spawn-frame diff vs **gold** until intentional divergence |

**(s) must never fall back to the gold Emscripten binary.** If `public/wasm/gzdoom-s/gzdoom.wasm` is missing, the UI shows a build error.

### Why two data paths?

| Path | Who parses MAP/SECTORS/LINEDEFS | Use |
|------|----------------------------------|-----|
| Gold raw IWAD | GZDoom inside WASM | 100% parity proof — “does GZDoom-as-WASM match GZDoom-native?” |
| (s) Node lumps + GZSTATE | `doom-wad-core` in Node | Modular debug — isolate renderer stages without re-parsing in engine; strip C++ incrementally |

Corpus proof that Node export ≡ GZDoom: `npm run test:corpus` (68/68 GZSTATE).

## Modular GLES render sections

Use these toggles to bisect Classic WebGL vs GZDoom parity. All are **GZDoom CVAR argv pairs** at session start (`+cvar value`) — no live Emscripten exports, no JS drawing.

| Render section | GZDoom CVAR(s) | Parity display mode | Layers panel (Classic) |
|----------------|----------------|---------------------|-------------------------|
| Wall columns / masked walls | `gl_render_walls` | `walls-only` | `solidWalls` |
| Floors / ceilings | `gl_render_flats` | `flats-only` | `solidFloors`, `solidCeilings` |
| Sprites / voxels / things | `gl_render_things` | `geometry` | `voxels` |
| Texture sampling | `gl_texture` | `notexture` | `wallTextures`, `floorTextures`, … |
| Sky / portals / mirrors | `gl_portals`, `gl_noskyboxes`, `gl_mirrors` | `no-portals` | `sky`, `courtyardSky` |
| Distance fog | `gl_fogmode` | `no-fog` | `dynamicLighting` |
| Colored sector light | `gl_lightmode`, `gl_light_sprites` | — | `coloredLighting` |
| Post-process / bloom | `gl_bloom` etc. | `no-post` | — |

Implementation:

- Gold + (s) argv: `src/gzdoom-oracle/parityDisplayModes.ts`, `applyGzdoomRenderLayers.ts`
- Classic TS draw plan: `src/wad/renderer/modular/renderLayerToggles.ts`

**(s) strip order** (C++ fork `feature/gzdoom-s-stripped`) — delete only after previous cut passes E1M1 + gold diff:

```text
1. Menus / title / startup (keep -gzrender_play entry)
2. Multiplayer / network
3. Console / unused CCMDs
4. ZScript VM
5. ACS
6. Vulkan / Poly / SW backends (keep GLES only)
7. Sound/music (browser uses -nosound + JS SFX events on gold path)
8. Demo recorder / stats
9. PK3 discovery beyond minimal shader pk3s
```

Each cut re-runs modular section toggles above against Classic WebGL.

## Architecture diagram

```text
                    ┌─────────────────────────────────────┐
                    │  doom-wad-lab host (TypeScript)      │
                    │  load WAD, argv, capture PNG — NO draw │
                    └──────────────┬──────────────────────┘
                                   │
           ┌───────────────────────┴───────────────────────┐
           │                                               │
           ▼                                               ▼
┌──────────────────────────┐                 ┌──────────────────────────┐
│  GOLD  gzdoom-wasm       │                 │  MODULAR  gzdoom-s-wasm   │
│  Emscripten → .wasm      │                 │  clang → .wasm (no emcc)  │
│  raw IWAD lumps          │                 │  NODE_LUMPS.WAD + GZSTATE │
│  public/wasm/gzdoom/     │                 │  public/wasm/gzdoom-s/    │
│  68/68 parity gate       │                 │  strip + section toggles  │
└────────────┬─────────────┘                 └────────────┬─────────────┘
             │                                          │
             └──────────────────┬───────────────────────┘
                                ▼
              GZDoom C++ GLES HW renderer → WebGL2 → canvas pixels
              (same draw code; runtime flags gles.webgl2, GZRenderOnly)
```

## Commands

```bash
# Gold oracle (Emscripten — keep frozen; raw IWAD lumps)
npm run build:gzdoom-wasm
npm run verify:gold-wasm          # sanity: gold artifact + path separation

# Modular pure WASM (scaffold until clang profile links)
npm run build:gzdoom-s-wasm

# UI
?renderer=gzdoom-wasm      # gold play / spawn capture
?renderer=gzdoom-s-wasm    # modular fork (requires gzdoom-s artifact)
```

## See also

- [gzdoom-s-wasm.md](./gzdoom-s-wasm.md) — (s) fork charter
- [wasm-renderer-invariants](../.cursor/rules/wasm-renderer-invariants.mdc) — no `#ifdef __EMSCRIPTEN__` in GLES draw paths; no JS rendering
- [parityDisplayModes.ts](../../src/gzdoom-oracle/parityDisplayModes.ts) — batch display modes
