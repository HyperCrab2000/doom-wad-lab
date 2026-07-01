/**
 * Level Viewer backend: GZDoom WASM renderer (capture + hosted play).
 *
 * Data paths:
 * - **Play** (`startGzdoomHostedPlay`): raw IWAD bytes only — GZDoom parses lumps internally.
 * - **Gold capture** (`captureGzdoomViewerFrame`): Node parse → GZSTATE for spawn-frame parity.
 */
import {
  encodeWadToArrayBuffer,
  exportToGzstate,
  loadWadFromArrayBuffer,
  writeGzstate,
} from '@hypercrab2000/doom-wad-core';

import { fetchRawIwad } from '@/wad/loader/iwadLumpAccess';
import {
  reportGzdoomProgress,
  type GzdoomLoadProgressReporter,
} from '@/features/level-viewer/gzdoomPlayLoadProgress';
import { runGzdoomPlay, runGzdoomMap, type GzdoomWasmModule } from '@/gzdoom-oracle/gzdoomWasmHost';
import {
  DEFAULT_RENDER_LAYER_TOGGLES,
  type RenderLayerToggles,
} from '@/wad/renderer/modular/renderLayerToggles';
import { buildGzdoomLayerArgv } from './applyGzdoomRenderLayers';
import { applyGzdoomLayerTogglesLive } from './applyGzdoomLayerTogglesLive';

export interface GzdoomViewerFrame {
  objectUrl: string;
}

let activeObjectUrl: string | null = null;
let activeHostedModule: GzdoomWasmModule | null = null;
let activeHostedKey = '';

function acquireCaptureCanvas(canvas: HTMLCanvasElement | null | undefined): HTMLCanvasElement {
  if (canvas) return canvas;
  const offscreen = document.createElement('canvas');
  offscreen.width = 640;
  offscreen.height = 480;
  return offscreen;
}

function revokeActiveUrl(): void {
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }
}

export interface GzdoomPlaySession {
  module: GzdoomWasmModule;
  /** Always 0 for play — lumps are parsed by GZDoom, not Node. */
  lumpCount: number;
}

/**
 * Node parse + re-encode for gold capture / GZSTATE export only (not the Play path).
 */
async function extractAndEncodeIwadForGzstate(
  iwadPath: string,
): Promise<{ bytes: Uint8Array; name: string; lumpCount: number }> {
  const res = await fetch(iwadPath);
  if (!res.ok) {
    throw new Error(`Failed to fetch IWAD ${iwadPath} (${res.status})`);
  }
  const buf = await res.arrayBuffer();
  validateResponse(buf, iwadPath);
  const wad = loadWadFromArrayBuffer(buf.slice(0));
  const encoded = encodeWadToArrayBuffer(wad);
  const name = iwadPath.split('/').pop() ?? 'DOOM.WAD';
  const lumpCount = wad.lumpInfo.length;
  console.log(
    `[gzdoom] Node WAD parse (gold/GZSTATE only): ${lumpCount} lumps from ${iwadPath}`,
  );
  return { bytes: new Uint8Array(encoded), name, lumpCount };
}

async function resolveGzstateBytes(
  iwadPath: string,
  map: string,
  iwadBuf: ArrayBuffer,
): Promise<{ bytes: Uint8Array; name: string }> {
  const gold = await loadGoldGzstateBytes(iwadPath, map);
  if (gold) return gold;
  const wad = loadWadFromArrayBuffer(iwadBuf.slice(0));
  return {
    bytes: new Uint8Array(writeGzstate(exportToGzstate(wad, map))),
    name: `${map}.gzstate`,
  };
}

async function loadGoldGzstateBytes(
  iwadPath: string,
  map: string,
): Promise<{ bytes: Uint8Array; name: string } | null> {
  const slug = iwadPath.toUpperCase().includes('DOOM2') ? 'DOOM2' : 'DOOM';
  const url = `/artifacts/gzrender-v2/gold-standard/${slug}/${map}/gzdoom.gzstate`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return { bytes: new Uint8Array(await res.arrayBuffer()), name: `${map}.gzstate` };
}

/**
 * Start fully-playable GZDoom in WASM: mount the **raw IWAD** — GZDoom parses all lumps internally.
 * No doom-wad-core parse or re-encode on this path.
 */
export async function startGzdoomHostedPlay(
  canvas: HTMLCanvasElement,
  iwadPath: string,
  map: string,
  layerToggles: RenderLayerToggles = DEFAULT_RENDER_LAYER_TOGGLES,
  onProgress?: GzdoomLoadProgressReporter,
): Promise<GzdoomPlaySession> {
  const sessionKey = `${iwadPath}::${map}`;
  if (activeHostedKey === sessionKey && activeHostedModule) {
    applyGzdoomLayerTogglesLive(activeHostedModule, layerToggles);
    return { module: activeHostedModule, lumpCount: 0 };
  }
  stopGzdoomHostedPlay();

  reportGzdoomProgress(onProgress, {
    phase: 'fetch-iwad',
    label: 'Fetching raw IWAD',
    detail: iwadPath.split('/').pop(),
    percent: 8,
  });
  const { bytes: iwadBytes, name: iwadName } = await fetchRawIwad(iwadPath);
  console.log(
    `[gzdoom] Play: mounting raw IWAD (${iwadBytes.byteLength} bytes) as /wad/${iwadName} — GZDoom parses lumps`,
  );

  activeHostedModule = await runGzdoomPlay({
    canvas,
    iwadBytes,
    iwadName,
    map,
    layerArgv: buildGzdoomLayerArgv(layerToggles),
    onProgress,
  });
  activeHostedKey = sessionKey;
  (window as unknown as { __gzPlayModule?: GzdoomWasmModule }).__gzPlayModule = activeHostedModule;
  canvas.focus();
  return { module: activeHostedModule, lumpCount: 0 };
}

export function getHostedGzdoomModule(): GzdoomWasmModule | null {
  return activeHostedModule;
}

export function stopGzdoomHostedPlay(): void {
  // GZDoom WASM has no clean shutdown; pause the old instance's main loop so it stops drawing /
  // burning CPU and does not contend with a newly-started module (e.g. switching to GZDoom (s)).
  try {
    activeHostedModule?.pauseMainLoop?.();
  } catch {
    // best effort
  }
  activeHostedModule = null;
  activeHostedKey = '';
}

export async function captureGzdoomViewerFrame(
  canvas: HTMLCanvasElement | null | undefined,
  iwadPath: string,
  map: string,
  onProgress?: GzdoomLoadProgressReporter,
): Promise<GzdoomViewerFrame> {
  revokeActiveUrl();

  // Node GZSTATE prep is silent — gold overlay shows WASM pipeline only.
  const captureCanvas = acquireCaptureCanvas(canvas);

  const { bytes: iwadBytes, name: iwadName } = await extractAndEncodeIwadForGzstate(iwadPath);

  const iwadBuf = iwadBytes.buffer.slice(
    iwadBytes.byteOffset,
    iwadBytes.byteOffset + iwadBytes.byteLength,
  );

  const gzstate = await resolveGzstateBytes(iwadPath, map, iwadBuf);

  reportGzdoomProgress(onProgress, {
    phase: 'load-script',
    label: 'Loading GZDoom WASM',
    detail: 'Gold spawn capture',
    percent: 12,
  });

  const { refFrameBytes, canvasPngBytes } = await runGzdoomMap({
    canvas: captureCanvas,
    iwadBytes,
    iwadName,
    map,
    gzstateBytes: gzstate.bytes,
    gzstateName: gzstate.name,
    onProgress,
  });

  const pngBytes = refFrameBytes?.length ? refFrameBytes : canvasPngBytes;
  if (!pngBytes?.length) {
    throw new Error('GZDoom WASM produced no frame bytes');
  }

  const blob = new Blob([pngBytes], { type: 'image/png' });
  activeObjectUrl = URL.createObjectURL(blob);

  reportGzdoomProgress(onProgress, {
    phase: 'ready',
    label: 'Gold capture',
    detail: 'Spawn frame ready',
    percent: 100,
  });

  return { objectUrl: activeObjectUrl };
}

function validateResponse(buffer: ArrayBuffer, path: string): void {
  if (buffer.byteLength < 12) {
    throw new Error(`WAD file is too small at ${path}`);
  }
  const magic = String.fromCharCode(
    new Uint8Array(buffer)[0]!,
    new Uint8Array(buffer)[1]!,
    new Uint8Array(buffer)[2]!,
    new Uint8Array(buffer)[3]!,
  );
  if (magic !== 'IWAD' && magic !== 'PWAD') {
    throw new Error(`Invalid WAD at ${path} (got ${magic}) — is the dev server running?`);
  }
}

export function disposeGzdoomViewerRuntime(): void {
  revokeActiveUrl();
  stopGzdoomHostedPlay();
}
