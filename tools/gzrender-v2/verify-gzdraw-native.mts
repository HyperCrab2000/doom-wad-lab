#!/usr/bin/env npx tsx
/**
 * Wave 2 gate — native GZDRAW dump completeness + determinism:
 *   - all required sections populated (camera, lists, portal snapshot)
 *   - optional FLAT_DRAWS + DRAW_META when geometry exists
 *   - byte-identical repeat capture at the same view
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/verify-gzdraw-native.mts
 *
 * Requires: tools/gzrender-v2/build-gzdoom.sh (native binary + pk3)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { GZDRAW_SECTION } from '../../src/wad/parity/gzdraw/constants.ts';
import { diffGzdraw, readGzdrawFile } from '../../src/wad/parity/gzdraw/index.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT_DIR = path.join(ROOT, 'artifacts/gzrender-v2/gzdraw-verify');
const GZSTATE = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/gzdoom.gzstate');
const CAPTURE = path.join(ROOT, 'tools/gzrender-v2/capture-gzdoom-gzdraw.sh');
const IWAD = path.join(ROOT, 'public/wads/DOOM.WAD');
const MAP = 'E1M1';

interface ViewCase {
  name: string;
  view: string;
  expect: { x: number; y: number; yaw: number };
}

const CASES: ViewCase[] = [
  { name: 'spawn', view: '1056,-3616,90', expect: { x: 1056, y: -3616, yaw: 90 } },
  { name: 'negative-xy', view: '-960,-3200,90', expect: { x: -960, y: -3200, yaw: 90 } },
  { name: 'sector-probe', view: '1831,-3254,0', expect: { x: 1831, y: -3254, yaw: 0 } },
];

function capture(view: string, out: string): void {
  execFileSync('bash', [CAPTURE, IWAD, MAP, GZSTATE, view, out], {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, GZDOOM_TIMEOUT: '60' },
  });
}

function sectionIds(doc: ReturnType<typeof readGzdrawFile>): Set<number> {
  return new Set(doc.sections.map((s) => s.sectionId));
}

function assertWave2Sections(caseName: string, outPath: string, expected: ViewCase['expect']): void {
  const doc = readGzdrawFile(fs.readFileSync(outPath));
  const present = sectionIds(doc);

  if (!doc.camera) {
    throw new Error(`${caseName}: missing CAMERA section in ${outPath}`);
  }
  const { x, y, yaw } = doc.camera;
  const tol = 1;
  if (Math.abs(x - expected.x) > tol || Math.abs(y - expected.y) > tol) {
    throw new Error(
      `${caseName}: camera xy mismatch — got (${x}, ${y}), expected (${expected.x}, ${expected.y})`,
    );
  }
  if (Math.abs(yaw - expected.yaw) > 0.01) {
    throw new Error(`${caseName}: camera yaw mismatch — got ${yaw}, expected ${expected.yaw}`);
  }
  if (doc.header.mapName !== MAP) {
    throw new Error(`${caseName}: mapName ${doc.header.mapName} != ${MAP}`);
  }

  const required = [
    GZDRAW_SECTION.CAMERA,
    GZDRAW_SECTION.SUBSECTORS,
    GZDRAW_SECTION.SECTORS,
    GZDRAW_SECTION.WALLS,
    GZDRAW_SECTION.SPRITES,
    GZDRAW_SECTION.PORTAL_SNAPSHOT,
  ];
  for (const id of required) {
    if (!present.has(id)) {
      throw new Error(`${caseName}: missing required section ${id}`);
    }
  }

  if (doc.subsectors.length === 0) {
    throw new Error(`${caseName}: empty VISIBLE_SUBSECTORS`);
  }
  if (doc.walls.length === 0) {
    throw new Error(`${caseName}: empty WALL_DRAWS`);
  }
  if (!doc.portalSnapshot) {
    throw new Error(`${caseName}: missing portal snapshot payload`);
  }

  if (caseName === 'spawn') {
    if (doc.flats.length === 0) {
      throw new Error(`${caseName}: spawn view should emit FLAT_DRAWS`);
    }
    if (!doc.drawMeta) {
      throw new Error(`${caseName}: missing DRAW_META section`);
    }
    if (doc.drawMeta.wallCount !== doc.walls.length) {
      throw new Error(
        `${caseName}: draw_meta.wallCount ${doc.drawMeta.wallCount} != walls ${doc.walls.length}`,
      );
    }
    if (doc.drawMeta.subsectorCount !== doc.subsectors.length) {
      throw new Error(
        `${caseName}: draw_meta.subsectorCount ${doc.drawMeta.subsectorCount} != subsectors ${doc.subsectors.length}`,
      );
    }
  }
}

function main(): void {
  if (!fs.existsSync(GZSTATE)) {
    console.error(`Missing gold gzstate: ${GZSTATE}`);
    process.exit(2);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const testCase of CASES) {
    const out = path.join(OUT_DIR, `${testCase.name}.gzdraw`);
    console.log(`capture ${testCase.name}: ${testCase.view}`);
    capture(testCase.view, out);
    assertWave2Sections(testCase.name, out, testCase.expect);
    const doc = readGzdrawFile(fs.readFileSync(out));
    console.log(
      `  ok camera + ${doc.subsectors.length} subsectors, ${doc.walls.length} walls, ${doc.flats.length} flats, ${doc.sprites.length} sprites`,
    );
  }

  const repeat = path.join(OUT_DIR, 'spawn-repeat.gzdraw');
  console.log('capture spawn-repeat (determinism)');
  capture('1056,-3616,90', repeat);

  const left = readGzdrawFile(fs.readFileSync(path.join(OUT_DIR, 'spawn.gzdraw')));
  const right = readGzdrawFile(fs.readFileSync(repeat));
  const diff = diffGzdraw(left, right);
  if (!diff.identical) {
    console.error('Determinism check failed for spawn repeat capture');
    process.exit(1);
  }

  console.log('Wave 2 native GZDRAW verify: PASS');
}

main();
