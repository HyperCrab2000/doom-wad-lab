import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadGzstateFromWad } from '@/wad/renderer/gzrender-v2/federated/stateLoader';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';

const DOOM_WAD = path.join(process.cwd(), 'public/wads/DOOM.WAD');

describe('federated stateLoader', () => {
  it('exports GZSTATE bytes for E1M1 when WAD present', () => {
    if (!fs.existsSync(DOOM_WAD)) return;
    const raw = fs.readFileSync(DOOM_WAD);
    const wad = loadWadFromArrayBuffer(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    const { doc, bytes } = loadGzstateFromWad(wad, 'E1M1');
    expect(doc.header.mapName).toBe('E1M1');
    expect(doc.vertices.length).toBeGreaterThan(0);
    expect(bytes.byteLength).toBeGreaterThan(64);
    expect(bytes[0]).toBe(0x47); // 'G'
    expect(bytes[1]).toBe(0x5a); // 'Z'
  });
});

describe('federated wasmHost', () => {
  it('loads WASM and validates GZSTATE magic', async () => {
    const wasmPath = path.join(process.cwd(), 'public/wasm/gzrender_federated/gzrender_federated.wasm');
    if (!fs.existsSync(wasmPath)) return;

    const { loadFederatedWasmInstance } = await import('@/wad/renderer/gzrender-v2/federated/wasmHost');
    const wasm = await loadFederatedWasmInstance();
    expect(wasm.init()).toBe(1);

    if (!fs.existsSync(DOOM_WAD)) return;
    const raw = fs.readFileSync(DOOM_WAD);
    const wad = loadWadFromArrayBuffer(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    const { doc, bytes } = loadGzstateFromWad(wad, 'E1M1');
    const ptr = wasm.copyGzstateBytes(bytes);
    expect(wasm.validateGzstate(ptr, bytes.byteLength)).toBe(1);
    wasm.setCounts(doc.vertices.length, doc.sectors.length);
    expect(wasm.getVertexCount()).toBe(doc.vertices.length);
    expect(wasm.getSectorCount()).toBe(doc.sectors.length);
    expect(wasm.isLoaded()).toBe(1);
  });
});
