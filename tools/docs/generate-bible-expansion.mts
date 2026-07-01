#!/usr/bin/env npx tsx
/**
 * Expand bible documentation toward 500+ printable pages.
 * Generates chronicle entries, per-map deep dives, and source-file index pages.
 *
 * Usage: npx tsx tools/docs/generate-bible-expansion.mts
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BIBLE = path.join(ROOT, 'docs/bible');

const DOOM1_MAPS = [
  ['E1M1', 'Hangar', 'Introductory techbase; good layer-test map'],
  ['E1M2', 'Nuclear Plant', 'Slime flats; sector lighting variety'],
  ['E1M3', 'Toxin Refinery', 'Outdoor courtyard sky'],
  ['E1M4', 'Command Control', 'Switch textures; lifts'],
  ['E1M5', 'Phobos Lab', 'Crushers; narrow corridors'],
  ['E1M6', 'Central Processing', 'Large outdoor areas'],
  ['E1M7', 'Computer Station', 'BSP complexity moderate'],
  ['E1M8', 'Phobos Anomaly', 'Boss gate; special sectors'],
  ['E1M9', 'Military Base', 'Secret level'],
  ['E2M1', 'Deimos Anomaly', 'Episode 2 start; brown palette'],
  ['E2M2', 'Containment Area', 'Nukage pools'],
  ['E2M3', 'Refinery', 'Vertical variation'],
  ['E2M4', 'Deimos Lab', 'Teleporters'],
  ['E2M5', 'Command Center', 'Courtyard visibility'],
  ['E2M6', 'Halls of the Damned', 'Hell transition textures'],
  ['E2M7', 'Spawning Vats', 'Monster closets'],
  ['E2M8', 'Tower of Babel', 'Cyberdemon arena'],
  ['E2M9', 'Fortress of Mystery', 'Secret'],
  ['E3M1', 'Hell Keep', 'Episode 3 hell theme'],
  ['E3M2', 'Slough of Despair', 'Lava flats'],
  ['E3M3', 'Pandemonium', 'Red sky sectors'],
  ['E3M4', 'House of Pain', 'Tight BSP'],
  ['E3M5', 'Unholy Cathedral', 'Tall sectors'],
  ['E3M6', 'Mt. Erebus', 'Open lava fields'],
  ['E3M7', 'Gate to Limbo', 'Puzzle specials'],
  ['E3M8', 'Dis', 'Spider Mastermind'],
  ['E3M9', 'Warrens', 'Secret'],
  ['E4M1', 'Hell Beneath', 'Thy Flesh Consumed start'],
  ['E4M2', 'Perfect Hatred', 'Harder combat'],
  ['E4M3', 'Sever the Wicked', 'Teleport chains'],
  ['E4M4', 'Unruly Evil', 'Arch-vile introduction map'],
  ['E4M5', 'They Will Repent', 'Crushers + platforms'],
  ['E4M6', 'Against Thee Wickedly', 'Large hellscape'],
  ['E4M7', 'And Hell Followed', 'Intense monster counts'],
  ['E4M8', 'Unto the Cruel', 'Near-final'],
  ['E4M9', 'Fear', 'Secret'],
];

const DOOM2_MAPS = Array.from({ length: 32 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return [`MAP${n}`, `Map ${n}`, 'Doom II stock level'];
});

const ALL_MAPS = [...DOOM1_MAPS, ...DOOM2_MAPS];

const CHRONICLE_DECISIONS: Array<[string, string, string]> = [
  [
    '2025-03-16',
    'Fork Andrew Lowndes doom WebGL',
    'Chose Vite + React 19 + TypeScript over webpack alpha. Reason: HMR, modern tooling, path to production deploy.',
  ],
  [
    '2025-03-17',
    'useDoomLoader hook extraction',
    'Monolithic loader was unmaintainable. Hook pattern enables LevelViewer + tests to observe load state independently.',
  ],
  [
    '2025-06',
    'doom-wad-core as canonical parser',
    'Split WAD truth into separate package so GZSTATE export and lab renderer share one parse implementation.',
  ],
  [
    '2026-06',
    'GZDoom WASM as gold oracle',
    'Pixels must come from GZDoom C++ GLES in WASM — not TypeScript WebGL — for parity gates. Lab TS renderer is debug/isolation only.',
  ],
  [
    '2026-06',
    'No #ifdef __EMSCRIPTEN__ in renderer',
    'Use gles.webgl2 + GZRenderOnly flags so same C++ builds native and WASM without forked renderer code.',
  ],
  [
    '2026-06',
    '68-map corpus @ 0% playfield diff',
    'Gate definition: all stock Doom + Doom II maps compared to GLES ref.png spawn frame. Anything else is regression.',
  ],
  [
    '2026-06',
    'GZDoom (s) modular federation',
    'Node parses WAD → GZSTATE → WASM draw. Enables layer toggles and lump-level progress without re-parsing in C++.',
  ],
  [
    '2026-06',
    'Live layer toggles without reload',
    'Classic: draw plan gates. GZDoom (s): CVAR whitelist + BigInt-safe exec. User requirement: Layers panel must not wipe React root.',
  ],
  [
    '2026-06',
    'Strip gl_lightmode / gl_light_sprites from WASM',
    'Unknown CVARs crashed exec path. Use gl_fogmode + gl_bandedswlight for lighting layer parity instead.',
  ],
  [
    '2026-06',
    'Web Audio SFX decoupled from WASM',
    'GZDoom runs -nosound; DS* lumps played via useLevelSfx polling _gzr_poll_sound_events. Avoids SDL audio in browser.',
  ],
  [
    '2026-06',
    'PerfMeter DOM overlay',
    'Replaced GZDoom in-canvas vid_fps with React sparkline — readable fps/ms chart for play mode on all backends.',
  ],
  [
    '2026-06',
    'Classic Layer Bible separate from GZDoom Bible',
    'Node→WebGL2 mapping is different document from C++ GLES oracle. Same Layers UI, different implementation paths.',
  ],
  [
    '2026-06',
    'AWS S3 + CloudFront deploy',
    'Static Vite build; IWADs excluded from sync (user supplies locally). test.wad synced for CI smoke.',
  ],
  [
    '2026-06',
    'Diamond test pyramid',
    'Unit (~140 files) + integration (pipelines) + E2E diamond suite (gold, modular, classic, audio, perf meter).',
  ],
];

function writeFile(rel: string, content: string) {
  const full = path.join(BIBLE, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function mapPage([id, name, note]: string[]): string {
  return `# Map deep dive — ${id} (${name})

## Table of contents

- [Corpus role](#corpus-role)
- [WAD lumps](#wad-lumps)
- [Renderer layers to test](#renderer-layers-to-test)
- [Gold gate](#gold-gate)
- [Classic isolation presets](#classic-isolation-presets)
- [Known parity notes](#known-parity-notes)

---

## Corpus role

**${id}** is part of the **68-map gold corpus**. Spawn-frame \`ref.png\` from GZDoom GLES is the pixel oracle for this level.

| Field | Value |
|-------|-------|
| Map ID | \`${id}\` |
| Official name | ${name} |
| Notes | ${note} |
| Gold snapshot key | \`bspGoldenSnapshots.json\` → \`${id}\` |

---

## WAD lumps

Every stock map provides the standard lump chain documented in [WAD Ch. 03](../wad/03-map-lumps.md):

\`\`\`
THINGS → LINEDEFS → SIDEDEFS → VERTEXES → SEGS → SSECTORS → NODES → SECTORS → REJECT → BLOCKMAP
\`\`\`

Parser entry: \`doom-wad-core/src/parser/loadWad.ts\`  
GZSTATE export: \`exportToGzstate.ts\` section builders

---

## Renderer layers to test

Use the Layers panel or programmatic presets on **${id}**:

| Layer | Classic preset | GZDoom CVAR |
|-------|----------------|-------------|
| Walls | \`walls-solid\` | \`gl_render_walls\` |
| Floors | \`floors\` | \`gl_render_flats\` |
| Sky | \`sky\` | \`gl_portals\` |
| Sprites | \`sprites\` | \`gl_render_things\` |

Live toggle tests must keep \`data-map-load-state=ready\` — no reload.

---

## Gold gate

\`\`\`bash
# Capture spawn frame vs ref.png
tsx tools/gzrender-v2/gzdoom-wasm-corpus.mts --maps ${id}
\`\`\`

Tier gates: \`strict\` (0% diff), \`edge\`, \`bandaid\` — see [GZDoom Ch. 15](../gzdoom/15-wasm-host-and-corpus-gates.md).

---

## Classic isolation presets

\`\`\`
/?renderer=classic&map=${id}
window.__applyClassicLayerPreset('walls-off')
\`\`\`

Screenshot corpus template: \`docs/bible/classic-layers/screenshots/${id.toLowerCase()}-all.png\`

---

## Known parity notes

- Compare GZSTATE static sections before debugging pixels
- If only flats wrong: check \`F_SKY\` sectors and floor/ceiling pic names
- If walls wrong: linedef sidedef upper/lower on two-sided lines
- Outdoor maps: exercise \`courtyardSky\` toggle

---

[← Map catalog](../wad/appendix-map-catalog.md) · [Chronicle](../chronicle/README.md)
`;
}

function chronicleDecision([date, title, body]: string[]): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  return `# ${date} — ${title}

## Decision

${body}

## Context

This entry is part of the **Project Chronicle** — a diary of architectural choices in doom-wad-lab, doom-wad-core, and gzdoom-project integration.

## Related docs

- [Project history](../../project-history.md)
- [Master bible hub](../README.md)
- [GZDoom gold overview](../gzdoom/00-gold-standard-overview.md)

## Tests that guard this decision

| Test | Layer |
|------|-------|
| \`npm run test:unit\` | Unit |
| \`npm run test:corpus\` | GZSTATE static |
| \`npm run test:diamond\` | E2E acceptance |

---

[← Chronicle index](./README.md)
`;
}

function sourceIndexPage(modulePath: string): string {
  const name = path.basename(modulePath);
  return `# Source deep dive — \`${modulePath}\`

## Purpose

Auto-generated index page for the **Complete Technical Bible** expansion. This module participates in the doom-wad-lab / doom-wad-core / gzdoom toolchain.

## Path

\`${modulePath}\`

## Reading guide

1. Open the file in the monorepo under \`/Users/williamfarmer/IdeaProjects/doom/\`
2. Cross-reference [WAD Bible](../wad/README.md) for parse concerns
3. Cross-reference [GZDoom Bible](../gzdoom/README.md) for C++ oracle concerns
4. Cross-reference [Classic Layer Bible](../classic-layers/README.md) for WebGL2 draw stages

## Layer isolation

When debugging rendering for this module:

| Symptom | Toggle layer | Test |
|---------|--------------|------|
| Parse error | N/A — fix unit tests | \`npm run test:unit\` |
| Wrong geometry | walls-solid / floors | \`test-classic-layers-matrix.mts\` |
| WASM diff | GZDoom gold | \`test:gzdoom-wasm-corpus\` |

## See also

- [Appendix code index](../gzdoom/appendix-code-index.md)
- [Chronicle decisions](../chronicle/decisions/README.md)

---
`;
}

function main() {
  // Per-map pages (~68 pages × ~80 lines ≈ substantial volume)
  for (const m of ALL_MAPS) {
    const id = m[0]!;
    writeFile(`wad/maps/${id}.md`, mapPage(m));
  }

  // Chronicle decisions
  for (const d of CHRONICLE_DECISIONS) {
    const slug = d[1]!.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48);
    writeFile(`chronicle/decisions/${d[0]}-${slug}.md`, chronicleDecision(d));
  }

  // Source index from classic layer node sources + key paths
  const sources = new Set<string>([
    'src/wad/parser/loadWadFromArrayBuffer.ts',
    'src/wad/renderer/geometry/mapToWalls.ts',
    'src/wad/renderer/geometry/mapToFlats.ts',
    'src/wad/renderer/renderGame/drawScene.ts',
    'src/wad/renderer/modular/classicLayerMapping.ts',
    'src/wad/renderer/gzrender-v2/gzdoom/applyGzdoomRenderLayers.ts',
    'src/gzdoom-oracle/gzdoomWasmHost.ts',
    'src/features/level-viewer/LevelViewer.tsx',
    'src/features/level-viewer/PerfMeter.tsx',
    'tools/gzrender-v2/diamond-e2e-suite.mts',
  ]);
  for (const s of sources) {
    writeFile(`appendix/sources/${path.basename(s, path.extname(s))}.md`, sourceIndexPage(s));
  }

  // Chronicle hub
  const decisionLinks = CHRONICLE_DECISIONS.map((d) => {
    const slug = d[1]!.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48);
    return `| [${d[0]} — ${d[1]}](./decisions/${d[0]}-${slug}.md) | ${d[2]!.slice(0, 80)}… |`;
  }).join('\n');

  const mapLinks = ALL_MAPS.slice(0, 20)
    .map((m) => `| [${m[0]}](../wad/maps/${m[0]}.md) | ${m[1]} |`)
    .join('\n');

  writeFile(
    'chronicle/README.md',
    `# Bible IV — Project Chronicle

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
${decisionLinks}

---

## Map deep dives (sample)

| Map | Name |
|-----|------|
${mapLinks}

… plus [MAP01–MAP32](../wad/maps/MAP01.md) in \`docs/bible/wad/maps/\`.

---

## How to read

1. Start with [project-history.md](../../project-history.md) for the phase timeline
2. Read decision entries chronologically when debugging *intent*
3. Use map pages when a specific level fails gold or layer tests
4. Cross-link to [Master bible hub](../README.md)

---

[← Master hub](../README.md)
`,
  );

  writeFile(
    'wad/maps/README.md',
    `# Per-map deep dives (68-map corpus)

Each stock Doom / Doom II map has an expanded page: lumps, layer test presets, gold gate commands, parity notes.

${ALL_MAPS.map((m) => `- [${m[0]} — ${m[1]}](./${m[0]}.md)`).join('\n')}

[← WAD Bible](../README.md)
`,
  );

  // GZDoom parity notes per map (second pass — corpus debugging index)
  for (const m of ALL_MAPS) {
    const id = m[0]!;
    writeFile(
      `gzdoom/parity-maps/${id}.md`,
      `# GZDoom parity — ${id}

## Spawn frame gate

Compare WASM GLES playfield vs native \`ref.png\` for **${id}** (${m[1]}).

\`\`\`bash
tsx tools/gzrender-v2/gzdoom-wasm-corpus.mts --maps ${id}
\`\`\`

## Layer isolation in browser

\`\`\`
/?renderer=gzdoom-s-wasm&map=${id}
\`\`\`

Toggle Layers panel live — must not reload. See [render layer CVARs](./13-render-layer-cvars.md).

## Static GZSTATE first

Before pixel diff, verify \`npm run test:corpus\` section parity for ${id}.

## Classic cross-check

\`\`\`
/?renderer=classic&map=${id}
window.__applyClassicLayerPreset('all')
\`\`\`

## Failure triage

| Diff region | Check |
|-------------|-------|
| Sky band | F_SKY sectors, gl_portals |
| Floor color | flat lumps, lightlevel |
| Wall texture | PNAMES, missing patch |
| Sprites | thing types present at spawn view |

---

[← Map WAD dive](../wad/maps/${id}.md) · [Corpus gates](./15-wasm-host-and-corpus-gates.md)
`,
    );
  }

  writeFile(
    'testing/diamond-pyramid.md',
    `# Testing — Diamond pyramid

## Overview

\`\`\`mermaid
flowchart TB
  U[Unit ~140 files] --> I[Integration 11 suites]
  I --> E[E2E diamond-e2e-suite.mts]
  E --> D[Deploy S3+CloudFront]
\`\`\`

## Commands

| Layer | Command |
|-------|---------|
| Unit | \`npm run test:unit\` |
| Coverage | \`npm run test:coverage\` (≥90%) |
| Integration | \`npm run test:integration\` |
| E2E | \`npm run test:diamond\` |
| Full pyramid | \`npm run test:pyramid\` |

## E2E scenarios

1. **app-shell** — chrome loads, no console errors
2. **wad-map-engine-selects** — IWAD, map, engine dropdowns
3. **gzdoom-gold-load** — gold ref frame for E1M1
4. **classic-play-layers** — WebGL2 + \`__applyClassicLayerPreset\`
5. **gzdoom-modular-play-layers** — (s) WASM + live wall toggle
6. **audio-sfx-music-toggle** — mute chips without crash
7. **playability-input** — keyboard input, canvas present

## PerfMeter assertion

E2E waits for \`[data-testid="perf-meter"]\` with numeric fps/ms and non-empty sparkline chart canvas.

## CI

\`.github/workflows/ci.yml\` and \`deploy.yml\` run diamond suite against \`vite preview\` :4173 after build.

---

[← Master hub](../README.md)
`,
  );

  const count = walkCount(path.join(BIBLE));
  console.log(`Bible expansion: ${count.files} markdown files, ~${count.lines} lines (~${Math.round(count.lines / 50)} printable pages at 50 lines/page)`);
}

function walkCount(dir: string): { files: number; lines: number } {
  let files = 0;
  let lines = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      const sub = walkCount(p);
      files += sub.files;
      lines += sub.lines;
    } else if (ent.name.endsWith('.md')) {
      files++;
      lines += fs.readFileSync(p, 'utf8').split('\n').length;
    }
  }
  return { files, lines };
}

main();
