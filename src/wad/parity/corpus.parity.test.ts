/**
 * Full IWAD corpus parity — requires pre-generated artifacts from:
 *   npm run corpus:parity:static -- public/wads/DOOM.WAD
 *   npm run corpus:parity:static -- public/wads/DOOM2.WAD
 *
 * Set GZRENDER_CORPUS_REQUIRED=1 to hard-fail when WADs or corpus artifacts are missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  assertFullParity,
  discoverMapNames,
  exportToGzstate,
  loadWadFromArrayBuffer,
  readGzstateFile,
} from '@hypercrab2000/doom-wad-core';

const CORPUS_REQUIRED = process.env.GZRENDER_CORPUS_REQUIRED === '1';
const CORPUS_ROOT = path.join(process.cwd(), 'artifacts/gzrender-v2/corpus');

const IWADS = [
  { wadPath: path.join(process.cwd(), 'public/wads/DOOM.WAD'), slug: 'DOOM' },
  { wadPath: path.join(process.cwd(), 'public/wads/DOOM2.WAD'), slug: 'DOOM2' },
] as const;

function loadWadOrSkip(wadPath: string) {
  if (!fs.existsSync(wadPath)) {
    if (CORPUS_REQUIRED) throw new Error(`Missing IWAD: ${wadPath}`);
    return null;
  }
  const raw = fs.readFileSync(wadPath);
  return loadWadFromArrayBuffer(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

describe('GZSTATE full corpus parity (68 maps)', () => {
  for (const { wadPath, slug } of IWADS) {
    describe(slug, () => {
      it('summary.json reports zero failures when present', () => {
        const summaryPath = path.join(CORPUS_ROOT, slug, 'summary.json');
        if (!fs.existsSync(summaryPath)) {
          if (CORPUS_REQUIRED) {
            throw new Error(
              `Missing corpus summary for ${slug}. Run: npm run corpus:parity:static -- ${wadPath}`,
            );
          }
          return;
        }
        const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as {
          mapCount: number;
          pass: number;
          fail: number;
          staticVerify?: boolean;
        };
        expect(summary.fail).toBe(0);
        expect(summary.pass).toBe(summary.mapCount);
        expect(summary.staticVerify).toBe(true);
      });

      it(
        'every map: Node export matches GZDoom dump (+ static WAD when artifacts exist)',
        async () => {
        const wad = loadWadOrSkip(wadPath);
        if (!wad) return;

        const maps = discoverMapNames(wad);
        expect(maps.length).toBeGreaterThan(0);

        let checked = 0;
        for (const map of maps) {
          const mapDir = path.join(CORPUS_ROOT, slug, map);
          const gzdoomPath = path.join(mapDir, 'gzdoom.gzstate');
          if (!fs.existsSync(gzdoomPath)) {
            if (CORPUS_REQUIRED) {
              throw new Error(`Missing GZDoom fixture for ${slug}/${map}: ${gzdoomPath}`);
            }
            continue;
          }

          const nodeDoc = exportToGzstate(wad, map);
          const gzdoomDoc = readGzstateFile(new Uint8Array(fs.readFileSync(gzdoomPath)));
          assertFullParity(nodeDoc, gzdoomDoc);
          checked++;

          const staticGzPath = path.join(mapDir, 'gzdoom-static.gzstate');
          if (fs.existsSync(staticGzPath)) {
            const staticDoc = readGzstateFile(new Uint8Array(fs.readFileSync(staticGzPath)));
            assertFullParity(staticDoc, gzdoomDoc);
          } else if (CORPUS_REQUIRED) {
            throw new Error(`Missing static GZDoom fixture for ${slug}/${map}`);
          }
        }

        if (CORPUS_REQUIRED) {
          expect(checked).toBe(maps.length);
        } else if (checked === 0) {
          // Soft skip when no corpus artifacts yet (smoke tests cover E1M1/MAP01 elsewhere).
          return;
        }
        },
        120_000,
      );
    });
  }
});
