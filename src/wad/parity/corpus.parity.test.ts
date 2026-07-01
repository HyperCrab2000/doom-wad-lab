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
  type Wad,
} from '@hypercrab2000/doom-wad-core';

import { parallelMap } from '../../../test/parallelMap';

const CORPUS_REQUIRED = process.env.GZRENDER_CORPUS_REQUIRED === '1';
const CORPUS_ROOT = path.join(process.cwd(), 'artifacts/gzrender-v2/corpus');

const IWADS = [
  { wadPath: path.join(process.cwd(), 'public/wads/DOOM.WAD'), slug: 'DOOM' },
  { wadPath: path.join(process.cwd(), 'public/wads/DOOM2.WAD'), slug: 'DOOM2' },
] as const;

const wadCache = new Map<string, Wad | null>();

function loadWadOrSkip(wadPath: string): Wad | null {
  if (!fs.existsSync(wadPath)) {
    if (CORPUS_REQUIRED) throw new Error(`Missing IWAD: ${wadPath}`);
    return null;
  }
  const raw = fs.readFileSync(wadPath);
  return loadWadFromArrayBuffer(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

function cachedWad(wadPath: string, slug: string): Wad | null {
  if (!wadCache.has(slug)) {
    wadCache.set(slug, loadWadOrSkip(wadPath));
  }
  return wadCache.get(slug) ?? null;
}

function assertMapParity(wad: Wad, slug: string, map: string): boolean {
  const mapDir = path.join(CORPUS_ROOT, slug, map);
  const gzdoomPath = path.join(mapDir, 'gzdoom.gzstate');
  if (!fs.existsSync(gzdoomPath)) {
    if (CORPUS_REQUIRED) {
      throw new Error(`Missing GZDoom fixture for ${slug}/${map}: ${gzdoomPath}`);
    }
    return false;
  }

  const nodeDoc = exportToGzstate(wad, map);
  const gzdoomDoc = readGzstateFile(new Uint8Array(fs.readFileSync(gzdoomPath)));
  assertFullParity(nodeDoc, gzdoomDoc);

  const staticGzPath = path.join(mapDir, 'gzdoom-static.gzstate');
  if (fs.existsSync(staticGzPath)) {
    const staticDoc = readGzstateFile(new Uint8Array(fs.readFileSync(staticGzPath)));
    assertFullParity(staticDoc, gzdoomDoc);
  } else if (CORPUS_REQUIRED) {
    throw new Error(`Missing static GZDoom fixture for ${slug}/${map}`);
  }

  return true;
}

describe('GZSTATE full corpus parity (68 maps)', () => {
  for (const { wadPath, slug } of IWADS) {
    const wad = cachedWad(wadPath, slug);
    const maps = wad ? discoverMapNames(wad) : [];

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

      it('loads IWAD when present', () => {
        if (!wad) return;
        expect(maps.length).toBeGreaterThan(0);
      });

      it(
        'every map: Node export matches GZDoom dump (+ static WAD when artifacts exist)',
        async () => {
          if (!wad) return;

          const results = await parallelMap(maps, (map) => assertMapParity(wad, slug, map));
          const checked = results.filter(Boolean).length;

          if (CORPUS_REQUIRED) {
            expect(checked).toBe(maps.length);
          } else if (checked === 0) {
            return;
          }
        },
        180_000,
      );
    });
  }
});
