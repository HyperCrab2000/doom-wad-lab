/**
 * Stage 0 — WAD data parity before any renderer or game-engine injection.
 *
 * Tier 1: parsed lump payloads match raw IWAD file slices (byte identity).
 * Tier 2: encode → parse round-trip preserves every lump payload.
 * Tier 3: direct map parse ≡ exportToGzstate → gzstateToWadMap (geometry + REJECT + BLOCKMAP).
 * Tier 4: export → writeGzstate → readGzstate → gzstateToWadMap (wire injectable bytes).
 *
 * Set WAD_DATA_PARITY_REQUIRED=1 to hard-fail when IWADs are missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  assertLumpCatalogParity,
  assertLumpFileParity,
  assertMapDataParity,
  discoverMapNames,
  encodeWadToArrayBuffer,
  exportToGzstate,
  loadWadFromArrayBuffer,
  readGzstate,
  runMapDataParity,
  writeGzstate,
} from '@hypercrab2000/doom-wad-core';

import { parallelMap } from '../../../test/parallelMap';
import { gzstateToWadMap } from '@/wad/renderer/gzrender-v2/federated/gzstateToWadMap';

const WAD_DATA_REQUIRED = process.env.WAD_DATA_PARITY_REQUIRED === '1';

const IWADS = [
  { wadPath: path.join(process.cwd(), 'public/wads/DOOM.WAD'), slug: 'DOOM' },
  { wadPath: path.join(process.cwd(), 'public/wads/DOOM2.WAD'), slug: 'DOOM2' },
] as const;

const wadCache = new Map<string, { wadPath: string; arrayBuffer: ArrayBuffer; wad: ReturnType<typeof loadWadFromArrayBuffer> }>();

function loadIwad(slug: string, wadPath: string) {
  if (!wadCache.has(slug)) {
    if (!fs.existsSync(wadPath)) {
      if (WAD_DATA_REQUIRED) throw new Error(`Missing IWAD: ${wadPath}`);
      wadCache.set(slug, null as never);
      return null;
    }
    const buf = fs.readFileSync(wadPath);
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    wadCache.set(slug, { wadPath, arrayBuffer, wad: loadWadFromArrayBuffer(arrayBuffer) });
  }
  return wadCache.get(slug) ?? null;
}

describe('Stage 0 — WAD data parity (pre-renderer)', () => {
  for (const { wadPath, slug } of IWADS) {
    describe(slug, () => {
      it('Tier 1: lump payloads match IWAD file bytes', () => {
        const loaded = loadIwad(slug, wadPath);
        if (!loaded) return;
        assertLumpFileParity(loaded.arrayBuffer, loaded.wad);
      });

      it('Tier 2: encode round-trip preserves lump payloads', () => {
        const loaded = loadIwad(slug, wadPath);
        if (!loaded) return;
        const encoded = encodeWadToArrayBuffer(loaded.wad);
        const roundTripped = loadWadFromArrayBuffer(encoded);
        assertLumpCatalogParity(loaded.wad, roundTripped);
        assertLumpFileParity(encoded, roundTripped);
      });

      it('Tier 3: GZSTATE export round-trip preserves full map data', async () => {
        const loaded = loadIwad(slug, wadPath);
        if (!loaded) return;
        const maps = discoverMapNames(loaded.wad);
        const failures: string[] = [];

        await parallelMap(maps, async (mapName) => {
          const direct = loaded.wad.maps[mapName];
          if (!direct) return;
          const doc = exportToGzstate(loaded.wad, mapName);
          const derived = gzstateToWadMap(doc);
          const result = runMapDataParity(direct, derived);
          if (!result.identical) {
            failures.push(
              `${mapName}: ${result.mismatches
                .slice(0, 4)
                .map((m) => `${m.field} (${m.message})`)
                .join('; ')}`,
            );
          }
        });

        if (failures.length > 0) {
          throw new Error(
            `GZSTATE map round-trip gaps (${failures.length}/${maps.length} maps):\n${failures.slice(0, 12).join('\n')}`,
          );
        }
      });

      it('Tier 4: GZSTATE wire round-trip preserves full map data', async () => {
        const loaded = loadIwad(slug, wadPath);
        if (!loaded) return;
        const maps = discoverMapNames(loaded.wad);
        const failures: string[] = [];

        await parallelMap(maps, async (mapName) => {
          const direct = loaded.wad.maps[mapName];
          if (!direct) return;
          const exported = exportToGzstate(loaded.wad, mapName);
          const wire = writeGzstate(exported);
          const decoded = readGzstate(wire);
          const derived = gzstateToWadMap(decoded);
          const result = runMapDataParity(direct, derived);
          if (!result.identical) {
            failures.push(
              `${mapName}: ${result.mismatches
                .slice(0, 4)
                .map((m) => `${m.field} (${m.message})`)
                .join('; ')}`,
            );
          }
        });

        if (failures.length > 0) {
          throw new Error(
            `GZSTATE wire round-trip gaps (${failures.length}/${maps.length} maps):\n${failures.slice(0, 12).join('\n')}`,
          );
        }
      });

      it('Tier 5: GZSTATE wire includes REJECT and BLOCKMAP raw sections when present', async () => {
        const loaded = loadIwad(slug, wadPath);
        if (!loaded) return;
        const maps = discoverMapNames(loaded.wad);
        const failures: string[] = [];

        await parallelMap(maps, async (mapName) => {
          const direct = loaded.wad.maps[mapName];
          if (!direct) return;
          const doc = exportToGzstate(loaded.wad, mapName);
          const wire = writeGzstate(doc);
          const decoded = readGzstate(wire);
          if (direct.REJECT && (!decoded.mapReject || decoded.mapReject.byteLength === 0)) {
            failures.push(`${mapName}: missing mapReject on wire`);
          }
          if (direct.BLOCKMAP_RAW && (!decoded.mapBlockmapRaw || decoded.mapBlockmapRaw.byteLength === 0)) {
            failures.push(`${mapName}: missing mapBlockmapRaw on wire`);
          }
        });

        if (failures.length > 0) {
          throw new Error(`GZSTATE wire lump gaps (${failures.length} maps):\n${failures.slice(0, 12).join('\n')}`);
        }
      });
    });
  }

  it('E1M1 smoke: direct map matches gzstate round-trip', () => {
    const loaded = loadIwad('DOOM', IWADS[0].wadPath);
    if (!loaded) return;
    const direct = loaded.wad.maps.E1M1;
    expect(direct).toBeDefined();
    const derived = gzstateToWadMap(exportToGzstate(loaded.wad, 'E1M1'));
    assertMapDataParity(direct!, derived, 'E1M1');
  });
});
