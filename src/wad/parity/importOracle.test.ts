/**
 * Stage 3 — GZDoom import oracle: WAD-load ref frame ≡ GZSTATE import frame.
 *
 * Requires: built GZDoom, IWAD, Node-exported GZSTATE with full WAD data (sections 22/23).
 *
 * Set IMPORT_ORACLE_REQUIRED=1 to hard-fail when artifacts missing or mismatch > 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import {
  exportToGzstate,
  GZSTATE_SECTION,
  loadWadFromArrayBuffer,
  writeGzstate,
} from '@hypercrab2000/doom-wad-core';

import { diffPlayfieldPngFiles, formatFrameDiff } from '@/wad/parity/frame/frameDiff';
import { prewarmFederatedWasmMap } from '@/wad/renderer/gzrender-v2/federated/federatedWasmBackend';
import { loadWadFromArrayBuffer as loadLabWad } from '@/wad/parser/loadWadFromArrayBuffer';

const REQUIRED = process.env.IMPORT_ORACLE_REQUIRED === '1';
const ROOT = process.cwd();
const REF_FRAME = path.join(ROOT, 'artifacts/gzrender-v2/gzdoom/E1M1.png');
const IMPORT_FRAME = path.join(ROOT, 'artifacts/gzrender-v2/gzrender-import/E1M1.png');
const NODE_GZSTATE = path.join(ROOT, 'artifacts/gzrender-v2/node-export/E1M1.gzstate');
const DOOM_WAD = path.join(ROOT, 'public/wads/DOOM.WAD');
const CAPTURE_IMPORT = path.join(ROOT, 'tools/gzrender-v2/capture-gzstate-import-frame.sh');

function sectionIds(doc: ReturnType<typeof exportToGzstate>): number[] {
  const ids = new Set<number>();
  const bytes = writeGzstate(doc);
  const view = new DataView(bytes);
  const sectionCount = view.getUint32(16, true);
  let off = 64;
  for (let i = 0; i < sectionCount; i++) {
    ids.add(view.getUint32(off, true));
    off += 16;
  }
  return [...ids];
}

describe('Stage 3 — GZDoom import oracle', () => {
  it('Node GZSTATE wire includes REJECT and BLOCKMAP for E1M1', () => {
    if (!fs.existsSync(DOOM_WAD)) {
      if (REQUIRED) throw new Error(`Missing IWAD: ${DOOM_WAD}`);
      return;
    }
    const buf = fs.readFileSync(DOOM_WAD);
    const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const doc = exportToGzstate(wad, 'E1M1');
    expect(doc.mapReject?.byteLength ?? 0).toBeGreaterThan(0);
    expect(doc.mapBlockmapRaw?.byteLength ?? 0).toBeGreaterThan(0);
    const ids = sectionIds(doc);
    expect(ids).toContain(GZSTATE_SECTION.MAP_REJECT);
    expect(ids).toContain(GZSTATE_SECTION.MAP_BLOCKMAP);
  });

  it('WASM federated path accepts full WAD-data GZSTATE for E1M1', async () => {
    const wasmPath = path.join(ROOT, 'public/wasm/gzrender_federated/gzrender_federated.wasm');
    if (!fs.existsSync(wasmPath) || !fs.existsSync(DOOM_WAD)) return;
    const buf = fs.readFileSync(DOOM_WAD);
    const wad = loadLabWad(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    await prewarmFederatedWasmMap(wad, 'E1M1', wad.maps.E1M1);
  });

  it('E1M1 import frame matches WAD-load reference (0% mismatch)', async () => {
    if (!fs.existsSync(DOOM_WAD)) {
      if (REQUIRED) throw new Error(`Missing IWAD: ${DOOM_WAD}`);
      return;
    }

    if (!fs.existsSync(REF_FRAME)) {
      if (!REQUIRED) return;
      execSync(
        `bash "${path.join(ROOT, 'tools/gzrender-v2/capture-gzdoom-ref-frame.sh')}" "${DOOM_WAD}" E1M1`,
        { stdio: 'inherit', cwd: ROOT },
      );
    }

    if (!fs.existsSync(NODE_GZSTATE) && !REQUIRED) return;

    execSync(`bash "${CAPTURE_IMPORT}" "${NODE_GZSTATE}" "${IMPORT_FRAME}"`, {
      stdio: 'inherit',
      cwd: ROOT,
      env: { ...process.env, IWAD: DOOM_WAD },
    });

    if (!fs.existsSync(REF_FRAME) || !fs.existsSync(IMPORT_FRAME)) {
      if (REQUIRED) throw new Error('Missing ref or import frame after capture');
      return;
    }

    const result = await diffPlayfieldPngFiles(REF_FRAME, IMPORT_FRAME, { tolerance: 0 });
    // eslint-disable-next-line no-console
    console.log(`E1M1 import oracle: ${formatFrameDiff(result)}`);

    if (process.env.IMPORT_ORACLE_REQUIRED === '1') {
      expect(result.identical, formatFrameDiff(result)).toBe(true);
      expect(result.mismatchRatio).toBe(0);
    } else {
      expect(result.comparedPixels).toBeGreaterThan(0);
    }
  });
});
