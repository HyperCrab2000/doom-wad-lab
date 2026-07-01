# Bible IV — Project Chronicle

**A diary of decisions, trade-offs, and timing** for doom-wad-lab, doom-wad-core, and GZDoom WASM integration.

This is the narrative companion to the technical WAD, GZDoom, and Classic Layer bibles. It records *why* choices were made, not only *what* the code does.

---

## Table of contents

| Section | Description |
|---------|-------------|
| [Decision log](#decision-log) | Dated architectural choices |
| [Per-map deep dives](../wad/maps/) | All 68 corpus maps |
| [Source deep dives](../appendix/sources/) | Key module index pages |
| [Project history](../../project-history.md) | Phase timeline Mar 2025 → present |

---

## Decision log

| Entry | Summary |
|-------|---------|
| [2025-03-16 — Fork Andrew Lowndes doom WebGL](./decisions/2025-03-16-fork-andrew-lowndes-doom-webgl.md) | Chose Vite + React 19 + TypeScript over webpack alpha. Reason: HMR, modern tooli… |
| [2025-03-17 — useDoomLoader hook extraction](./decisions/2025-03-17-usedoomloader-hook-extraction.md) | Monolithic loader was unmaintainable. Hook pattern enables LevelViewer + tests t… |
| [2025-06 — doom-wad-core as canonical parser](./decisions/2025-06-doom-wad-core-as-canonical-parser.md) | Split WAD truth into separate package so GZSTATE export and lab renderer share o… |
| [2026-06 — GZDoom WASM as gold oracle](./decisions/2026-06-gzdoom-wasm-as-gold-oracle.md) | Pixels must come from GZDoom C++ GLES in WASM — not TypeScript WebGL — for parit… |
| [2026-06 — No #ifdef __EMSCRIPTEN__ in renderer](./decisions/2026-06-no-ifdef-emscripten-in-renderer.md) | Use gles.webgl2 + GZRenderOnly flags so same C++ builds native and WASM without … |
| [2026-06 — 68-map corpus @ 0% playfield diff](./decisions/2026-06-68-map-corpus-0-playfield-diff.md) | Gate definition: all stock Doom + Doom II maps compared to GLES ref.png spawn fr… |
| [2026-06 — GZDoom (s) modular federation](./decisions/2026-06-gzdoom-s-modular-federation.md) | Node parses WAD → GZSTATE → WASM draw. Enables layer toggles and lump-level prog… |
| [2026-06 — Live layer toggles without reload](./decisions/2026-06-live-layer-toggles-without-reload.md) | Classic: draw plan gates. GZDoom (s): CVAR whitelist + BigInt-safe exec. User re… |
| [2026-06 — Strip gl_lightmode / gl_light_sprites from WASM](./decisions/2026-06-strip-gl-lightmode-gl-light-sprites-from-wasm.md) | Unknown CVARs crashed exec path. Use gl_fogmode + gl_bandedswlight for lighting … |
| [2026-06 — Web Audio SFX decoupled from WASM](./decisions/2026-06-web-audio-sfx-decoupled-from-wasm.md) | GZDoom runs -nosound; DS* lumps played via useLevelSfx polling _gzr_poll_sound_e… |
| [2026-06 — PerfMeter DOM overlay](./decisions/2026-06-perfmeter-dom-overlay.md) | Replaced GZDoom in-canvas vid_fps with React sparkline — readable fps/ms chart f… |
| [2026-06 — Classic Layer Bible separate from GZDoom Bible](./decisions/2026-06-classic-layer-bible-separate-from-gzdoom-bible.md) | Node→WebGL2 mapping is different document from C++ GLES oracle. Same Layers UI, … |
| [2026-06 — AWS S3 + CloudFront deploy](./decisions/2026-06-aws-s3-cloudfront-deploy.md) | Static Vite build; IWADs excluded from sync (user supplies locally). test.wad sy… |
| [2026-06 — Diamond test pyramid](./decisions/2026-06-diamond-test-pyramid.md) | Unit (~140 files) + integration (pipelines) + E2E diamond suite (gold, modular, … |

---

## Map deep dives (sample)

| Map | Name |
|-----|------|
| [E1M1](../wad/maps/E1M1.md) | Hangar |
| [E1M2](../wad/maps/E1M2.md) | Nuclear Plant |
| [E1M3](../wad/maps/E1M3.md) | Toxin Refinery |
| [E1M4](../wad/maps/E1M4.md) | Command Control |
| [E1M5](../wad/maps/E1M5.md) | Phobos Lab |
| [E1M6](../wad/maps/E1M6.md) | Central Processing |
| [E1M7](../wad/maps/E1M7.md) | Computer Station |
| [E1M8](../wad/maps/E1M8.md) | Phobos Anomaly |
| [E1M9](../wad/maps/E1M9.md) | Military Base |
| [E2M1](../wad/maps/E2M1.md) | Deimos Anomaly |
| [E2M2](../wad/maps/E2M2.md) | Containment Area |
| [E2M3](../wad/maps/E2M3.md) | Refinery |
| [E2M4](../wad/maps/E2M4.md) | Deimos Lab |
| [E2M5](../wad/maps/E2M5.md) | Command Center |
| [E2M6](../wad/maps/E2M6.md) | Halls of the Damned |
| [E2M7](../wad/maps/E2M7.md) | Spawning Vats |
| [E2M8](../wad/maps/E2M8.md) | Tower of Babel |
| [E2M9](../wad/maps/E2M9.md) | Fortress of Mystery |
| [E3M1](../wad/maps/E3M1.md) | Hell Keep |
| [E3M2](../wad/maps/E3M2.md) | Slough of Despair |

… plus [MAP01–MAP32](../wad/maps/MAP01.md) in `docs/bible/wad/maps/`.

---

## How to read

1. Start with [project-history.md](../../project-history.md) for the phase timeline
2. Read decision entries chronologically when debugging *intent*
3. Use map pages when a specific level fails gold or layer tests
4. Cross-link to [Master bible hub](../README.md)

---

[← Master hub](../README.md)
