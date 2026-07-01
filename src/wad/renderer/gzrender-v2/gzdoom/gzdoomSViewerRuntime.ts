/**
 * Level Viewer backend: GZDoom (s) WASM — stripped fork.
 *
 * Data path (Node owns lump parse; engine/renderer consumes injected data):
 * 1. doom-wad-core parses the disk IWAD → individual lumps in memory.
 * 2. Lumps are re-serialized into NODE_LUMPS.WAD (injected lump archive, not the raw disk file).
 * 3. Map geometry is exported as GZSTATE → -loadgzstate (P_OpenMapDataFromGzstate — no WAD MAP parse).
 * 4. GZDoom (s) mounts NODE_LUMPS.WAD for R_Init textures/sprites; map comes from GZSTATE only.
 */
import {
  encodeWadToArrayBuffer,
  exportToGzstate,
  loadWadFromArrayBuffer,
  writeGzstate,
} from '@hypercrab2000/doom-wad-core';

import { runGzdoomSPlay, resetGzdoomSHostCaches, type GzdoomWasmModule } from '@/gzdoom-oracle/gzdoomSWasmHost';
import {
  DEFAULT_RENDER_LAYER_TOGGLES,
  type RenderLayerToggles,
} from '@/wad/renderer/modular/renderLayerToggles';
import { buildGzdoomLayerArgv, gzdoomLayerSessionKey } from './applyGzdoomRenderLayers';

/** MEMFS path for the Node-built lump archive (not the raw disk IWAD). */
export const GZDOOM_S_INJECTED_IWAD = 'NODE_LUMPS.WAD';

export interface GzdoomSPlaySession {
  module: GzdoomWasmModule;
  lumpCount: number;
  gzstateBytes: number;
}

let activeModule: GzdoomWasmModule | null = null;
let activeKey = '';
/** Bumped on stop; in-flight startGzdoomSPlay commits only when its token still matches. */
let playGeneration = 0;

export class GzdoomSSessionSupersededError extends Error {
  constructor() {
    super('GZDoom (s) play session superseded');
    this.name = 'GzdoomSSessionSupersededError';
  }
}

async function prepareNodeInjectedLumpsAndGzstate(
  iwadPath: string,
  map: string,
): Promise<{
  iwadBytes: Uint8Array;
  iwadName: string;
  lumpCount: number;
  gzstateBytes: Uint8Array;
  gzstateName: string;
}> {
  const res = await fetch(iwadPath);
  if (!res.ok) throw new Error(`Failed to fetch IWAD ${iwadPath} (${res.status})`);
  const buf = await res.arrayBuffer();
  validateWadMagic(buf, iwadPath);

  const wad = loadWadFromArrayBuffer(buf.slice(0));
  const lumpCount = wad.lumpInfo.length;
  const encoded = encodeWadToArrayBuffer(wad);
  const gzstateDoc = exportToGzstate(wad, map);
  const gzstateWire = writeGzstate(gzstateDoc);

  console.log(
    `[gzdoom-s] Node parse: ${lumpCount} lumps → injected ${GZDOOM_S_INJECTED_IWAD} (${encoded.byteLength}b) + GZSTATE ${gzstateWire.byteLength}b for ${map} (map via -loadgzstate, renderer does not parse MAP lumps)`,
  );

  return {
    iwadBytes: new Uint8Array(encoded),
    iwadName: GZDOOM_S_INJECTED_IWAD,
    lumpCount,
    gzstateBytes: new Uint8Array(gzstateWire),
    gzstateName: `${map}.gzstate`,
  };
}

export async function startGzdoomSPlay(
  canvas: HTMLCanvasElement,
  iwadPath: string,
  map: string,
  layerToggles: RenderLayerToggles = DEFAULT_RENDER_LAYER_TOGGLES,
): Promise<GzdoomSPlaySession> {
  const layerKey = gzdoomLayerSessionKey(layerToggles);
  const sessionKey = `${iwadPath}::${map}::${layerKey}`;
  if (activeKey === sessionKey && activeModule) {
    return { module: activeModule, lumpCount: 0, gzstateBytes: 0 };
  }
  stopGzdoomSPlay();
  const myGen = playGeneration;

  const prepared = await prepareNodeInjectedLumpsAndGzstate(iwadPath, map);
  if (myGen !== playGeneration) {
    throw new GzdoomSSessionSupersededError();
  }

  const module = await runGzdoomSPlay({
    canvas,
    iwadBytes: prepared.iwadBytes,
    iwadName: prepared.iwadName,
    map,
    gzstateBytes: prepared.gzstateBytes,
    gzstateName: prepared.gzstateName,
    layerArgv: buildGzdoomLayerArgv(layerToggles),
  });
  if (myGen !== playGeneration) {
    try {
      module.pauseMainLoop?.();
    } catch {
      // best effort
    }
    throw new GzdoomSSessionSupersededError();
  }
  activeModule = module;
  activeKey = sessionKey;
  canvas.focus();
  return {
    module: activeModule,
    lumpCount: prepared.lumpCount,
    gzstateBytes: prepared.gzstateBytes.byteLength,
  };
}

export function getGzdoomSModule(): GzdoomWasmModule | null {
  return activeModule;
}

export function stopGzdoomSPlay(): void {
  playGeneration += 1;
  // Pause the old (s) instance's main loop on teardown — GZDoom WASM cannot cleanly exit, and a
  // still-running module contends with the next one for the canvas/WebGL2 context.
  try {
    activeModule?.pauseMainLoop?.();
  } catch {
    // best effort
  }
  activeModule = null;
  activeKey = '';
}

function validateWadMagic(buffer: ArrayBuffer, path: string): void {
  if (buffer.byteLength < 12) throw new Error(`WAD too small at ${path}`);
  const magic = String.fromCharCode(
    new Uint8Array(buffer)[0]!,
    new Uint8Array(buffer)[1]!,
    new Uint8Array(buffer)[2]!,
    new Uint8Array(buffer)[3]!,
  );
  if (magic !== 'IWAD' && magic !== 'PWAD') {
    throw new Error(`Invalid WAD at ${path} (got ${magic})`);
  }
}

export function disposeGzdoomSRuntime(): void {
  stopGzdoomSPlay();
  resetGzdoomSHostCaches();
}
