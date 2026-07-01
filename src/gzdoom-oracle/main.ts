/**
 * Auto-capture mode for headless Step 2 parity (puppeteer).
 * URL: /gzdoom-oracle.html?capture=E1M1&iwad=/wads/DOOM.WAD
 * GZDRAW: add &gzdraw=1&view=x,y,yaw&probeId=0
 */
import { encodeWadToArrayBuffer, exportToGzstate, loadWadFromArrayBuffer, writeGzstate } from '@hypercrab2000/doom-wad-core';

import { defaultGzdrawMemfsPath, runGzdoomHosted, runGzdoomMap, runGzdoomPlay } from './gzdoomWasmHost';
import { parseDisplayModeId, type DisplayModeId } from './parityDisplayModes';

declare global {
  interface Window {
    __gzdoomOracleCapture?: {
      status: string;
      error?: string;
      done: boolean;
      map?: string;
      refPngBytes?: number[];
      canvasPngBytes?: number[];
      memfsRefPngBytes?: number[];
      gzdrawBytes?: number[];
    };
    __gzdoomOracleGzstate?: { name: string; bytes: Uint8Array };
  }
}

const statusEl = document.getElementById('status')!;
const iwadInput = document.getElementById('iwad-file') as HTMLInputElement;
const gzstateInput = document.getElementById('gzstate-file') as HTMLInputElement;
const mapSelect = document.getElementById('map-select') as HTMLSelectElement;
const runBtn = document.getElementById('run-btn') as HTMLButtonElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;

let iwadBytes: Uint8Array | null = null;
let iwadName = 'DOOM.WAD';
let gzstateBytes: Uint8Array | null = null;
let gzstateName = 'level.gzstate';

function setStatus(msg: string): void {
  statusEl.textContent = msg;
  if (window.__gzdoomOracleCapture) {
    window.__gzdoomOracleCapture.status = msg;
  }
}

function setError(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  setStatus(msg);
  if (window.__gzdoomOracleCapture) {
    window.__gzdoomOracleCapture.error = msg;
    window.__gzdoomOracleCapture.done = true;
  }
}

async function loadIwadFromUrl(url: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch IWAD ${url}: ${res.status}`);
  const buf = await res.arrayBuffer();
  const wad = loadWadFromArrayBuffer(buf.slice(0));
  const encoded = encodeWadToArrayBuffer(wad);
  iwadBytes = new Uint8Array(encoded);
  iwadName = url.split('/').pop() ?? 'DOOM.WAD';
  const { discoverMapNames } = await import('@hypercrab2000/doom-wad-core');
  const maps = discoverMapNames(wad);
  setStatus(`Node extracted ${wad.lumpInfo.length} lumps → injected IWAD ready (${iwadName})`);
  mapSelect.innerHTML = '<option value="">— map —</option>';
  for (const map of maps) {
    const opt = document.createElement('option');
    opt.value = map;
    opt.textContent = map;
    mapSelect.appendChild(opt);
  }
  mapSelect.disabled = false;
  runBtn.disabled = false;
}

async function buildGzstateForMap(map: string): Promise<void> {
  if (!iwadBytes) return;
  const buf = iwadBytes.buffer.slice(iwadBytes.byteOffset, iwadBytes.byteOffset + iwadBytes.byteLength);
  const wad = loadWadFromArrayBuffer(buf);
  const doc = exportToGzstate(wad, map);
  const wire = writeGzstate(doc);
  gzstateBytes = new Uint8Array(wire);
  gzstateName = `${map}.gzstate`;
}

async function runMap(
  map: string,
  useGzstate: boolean,
  renderProbe?: string,
  renderView?: string,
  gzdraw?: boolean,
  probeId?: number,
  displayMode?: DisplayModeId,
  shaderDebugMode?: number,
): Promise<void> {
  if (!iwadBytes) throw new Error('IWAD not loaded');
  if (gzdraw && !useGzstate && !gzstateBytes) {
    throw new Error('GZDRAW capture requires gzstate (gold-standard or injected)');
  }
  if (useGzstate && !gzstateBytes) await buildGzstateForMap(map);
  setStatus(`Running GZDoom WASM — ${map}…`);
  const gzdrawDumpPath = gzdraw ? defaultGzdrawMemfsPath(map, probeId) : undefined;
  const { canvasPngBytes, refFrameBytes, gzdrawBytes } = await runGzdoomMap({
    canvas,
    iwadBytes,
    iwadName,
    map,
    gzstateBytes: useGzstate ? gzstateBytes! : undefined,
    gzstateName: useGzstate ? gzstateName : undefined,
    renderProbe,
    renderView,
    gzdrawDumpPath,
    probeId,
    displayMode,
    shaderDebugMode,
  });
  setStatus(`GZDoom WASM finished ${map}`);
  if (window.__gzdoomOracleCapture) {
    window.__gzdoomOracleCapture.done = true;
    window.__gzdoomOracleCapture.map = map;
    if (canvasPngBytes?.length) {
      window.__gzdoomOracleCapture.canvasPngBytes = [...canvasPngBytes];
    }
    if (refFrameBytes?.length) {
      window.__gzdoomOracleCapture.memfsRefPngBytes = [...refFrameBytes];
    }
    if (refFrameBytes?.length) {
      window.__gzdoomOracleCapture.refPngBytes = [...refFrameBytes];
    } else if (canvasPngBytes?.length) {
      window.__gzdoomOracleCapture.refPngBytes = [...canvasPngBytes];
    }
    if (gzdrawBytes?.length) {
      window.__gzdoomOracleCapture.gzdrawBytes = [...gzdrawBytes];
    }
  }
}

iwadInput.addEventListener('change', async () => {
  const file = iwadInput.files?.[0];
  if (!file) return;
  const buf = await file.arrayBuffer();
  const wad = loadWadFromArrayBuffer(buf.slice(0));
  const encoded = encodeWadToArrayBuffer(wad);
  iwadBytes = new Uint8Array(encoded);
  iwadName = file.name;
  const { discoverMapNames } = await import('@hypercrab2000/doom-wad-core');
  const maps = discoverMapNames(wad);
  mapSelect.innerHTML = '<option value="">— map —</option>';
  for (const m of maps) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    mapSelect.appendChild(opt);
  }
  mapSelect.disabled = false;
  runBtn.disabled = false;
  setStatus(`Node extracted ${wad.lumpInfo.length} lumps → injected ${file.name} (${maps.length} maps)`);
});

gzstateInput.addEventListener('change', async () => {
  const file = gzstateInput.files?.[0];
  if (!file) return;
  gzstateBytes = new Uint8Array(await file.arrayBuffer());
  gzstateName = file.name;
  setStatus(`GZSTATE: ${file.name} (${file.size} bytes)`);
});

runBtn.addEventListener('click', async () => {
  const map = mapSelect.value;
  if (!map) return;
  runBtn.disabled = true;
  try {
    await runMap(map, !!gzstateBytes);
  } catch (err) {
    setError(err);
  } finally {
    runBtn.disabled = false;
  }
});

async function maybeInteractivePlay(): Promise<boolean> {
  const params = new URLSearchParams(location.search);
  const hostedMap = params.get('hosted');
  const playMap = params.get('play');
  const map = hostedMap ?? playMap;
  if (!map) return false;
  const iwad = params.get('iwad') ?? '/wads/DOOM.WAD';
  window.__gzdoomOracleCapture = { status: 'starting', done: false, map };
  try {
    await loadIwadFromUrl(iwad);
    if (!iwadBytes) throw new Error('IWAD not loaded for play');
    let module: unknown;
    if (hostedMap) {
      // Renderer-only core: GZRenderOnly + injected GZSTATE; host drives camera via gzr_set_view.
      setStatus(`GZDoom WASM renderer-only — ${hostedMap}…`);
      if (!gzstateBytes) await buildGzstateForMap(hostedMap);
      if (!gzstateBytes) throw new Error(`GZSTATE required for renderer-only host (${hostedMap})`);
      module = await runGzdoomHosted({ canvas, iwadBytes, iwadName, map: hostedMap, gzstateBytes, gzstateName });
      setStatus(`GZDoom WASM renderer-only running — ${hostedMap}`);
    } else {
      setStatus(`GZDoom WASM play — ${playMap}…`);
      module = await runGzdoomPlay({ canvas, iwadBytes, iwadName, map: playMap! });
      setStatus(`GZDoom WASM playing — ${playMap}`);
    }
    (window as unknown as { __gzHostedModule?: unknown }).__gzHostedModule = module;
    if (window.__gzdoomOracleCapture) window.__gzdoomOracleCapture.done = true;
  } catch (err) {
    setError(err);
  }
  return true;
}

async function maybeAutoCapture(): Promise<void> {
  if (await maybeInteractivePlay()) return;
  const params = new URLSearchParams(location.search);
  const map = params.get('capture');
  const iwad = params.get('iwad') ?? '/wads/DOOM.WAD';
  const useGzstate = params.get('gzstate') !== '0';
  const gzdraw = params.get('gzdraw') === '1';
  const renderView = params.get('view') ?? undefined;
  const probeParam = params.get('probeId');
  let probeId: number | undefined;
  const needGzstate = gzdraw || useGzstate;
  if (!map) {
    setStatus('Load DOOM.WAD or DOOM2.WAD — GZDoom AS-IS (WASM).');
    return;
  }

  window.__gzdoomOracleCapture = { status: 'starting', done: false, map };
  try {
    if (probeParam != null && probeParam !== '') {
      probeId = Number(probeParam);
      if (!Number.isInteger(probeId)) {
        throw new Error(`Invalid probeId: ${probeParam}`);
      }
    }
    await loadIwadFromUrl(iwad);
    mapSelect.value = map;
    if (window.__gzdoomOracleGzstate) {
      gzstateBytes = window.__gzdoomOracleGzstate.bytes;
      gzstateName = window.__gzdoomOracleGzstate.name;
    } else if (needGzstate) {
      const slug = map.startsWith('MAP') ? 'DOOM2' : 'DOOM';
      const gzUrl = `/artifacts/gzrender-v2/gold-standard/${slug}/${map}/gzdoom.gzstate`;
      try {
        const res = await fetch(gzUrl);
        if (res.ok) {
          gzstateBytes = new Uint8Array(await res.arrayBuffer());
          gzstateName = `${map}.gzstate`;
        }
      } catch {
        // gold-standard gzstate optional when not injected
      }
    }
    if (gzdraw && !gzstateBytes) {
      throw new Error(`GZDRAW capture requires gzstate for ${map}`);
    }
    const modeRaw = params.get('mode');
    const displayMode = modeRaw ? parseDisplayModeId(modeRaw) : undefined;
    const shaderDebugRaw = params.get('shaderDebug');
    const shaderDebugMode = shaderDebugRaw ? Number(shaderDebugRaw) : undefined;
    await runMap(
      map,
      !!gzstateBytes,
      params.get('probe') ?? undefined,
      renderView,
      gzdraw,
      probeId,
      displayMode,
      shaderDebugMode,
    );
  } catch (err) {
    setError(err);
  }
}

void maybeAutoCapture();
