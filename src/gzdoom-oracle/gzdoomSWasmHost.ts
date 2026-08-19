/**
 * GZDoom (s) WASM — modular stripped fork host.
 *
 * Loads ONLY from /wasm/gzdoom-s/ (never /wasm/gzdoom/ gold paths).
 * Phase 0: Emscripten artifact in gzdoom-s/ (separate build or bootstrap copy).
 * Target: pure clang .wasm via gzdoomPureWasmHost when gzdoom.js absent.
 */

import { buildParityCaptureArgv } from './parityDisplayModes';
import {
  GZDOOM_S_PK3_BASE,
  GZDOOM_S_WASM_URL,
  GzdoomSPureWasmNotBuiltError,
  loadGzdoomSPureWasm,
} from './gzdoomPureWasmHost';
import { prepareHostedPlayCanvas, type GzdoomWasmModule } from './gzdoomWasmHost';
import {
  reportGzdoomProgress,
  type GzdoomLoadProgressReporter,
} from '@/features/level-viewer/gzdoomPlayLoadProgress';

export { GzdoomSPureWasmNotBuiltError };

const STRIPPED_BASE = '/wasm/gzdoom-s';
const GZDoom_S_JS = `${STRIPPED_BASE}/gzdoom.js`;

declare global {
  interface Window {
    createGzdoomModule?: (opts: Record<string, unknown>) => Promise<GzdoomWasmModule>;
  }
}

const HOSTED_PLAY_WIDTH = 1280;
const HOSTED_PLAY_HEIGHT = 960;

const PK3_FILES = [
  'gzdoom.pk3',
  'gzdoom-wasm-shaders.pk3',
  'game_support.pk3',
  'game_widescreen_gfx.pk3',
  'brightmaps.pk3',
  'lights.pk3',
] as const;

let scriptPromise: Promise<void> | null = null;
let resolvedKind: 'emscripten' | 'pure' | null = null;

/** Reset host loader caches (call on teardown so a later bootstrap/retry can reload). */
export function resetGzdoomSHostCaches(): void {
  scriptPromise = null;
  resolvedKind = null;
}

async function responseLooksLikeHtml(res: Response): Promise<boolean> {
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('text/html')) return true;
  const head = (await res.clone().text()).slice(0, 16);
  return head.trimStart().startsWith('<');
}

async function wasmResponseLooksValid(res: Response): Promise<boolean> {
  if (!res.ok || (await responseLooksLikeHtml(res))) return false;
  const buf = new Uint8Array(await res.clone().arrayBuffer());
  return buf.byteLength >= 4 && buf[0] === 0x00 && buf[1] === 0x61 && buf[2] === 0x73 && buf[3] === 0x6d;
}

/** Detect (s) artifact in gzdoom-s/ only — never probes gold /wasm/gzdoom/. */
async function resolveGzdoomSArtifactKind(): Promise<'emscripten' | 'pure'> {
  if (resolvedKind) return resolvedKind;

  try {
    const jsRes = await fetch(GZDoom_S_JS, { method: 'GET' });
    if (jsRes.ok && !(await responseLooksLikeHtml(jsRes))) {
      resolvedKind = 'emscripten';
      return resolvedKind;
    }
  } catch {
    // fall through
  }

  try {
    const wasmRes = await fetch(GZDoom_S_WASM_URL, { method: 'GET' });
    if (await wasmResponseLooksValid(wasmRes)) {
      resolvedKind = 'pure';
      return resolvedKind;
    }
  } catch {
    // fall through
  }

  throw new GzdoomSPureWasmNotBuiltError(
    `no gzdoom.js or gzdoom.wasm in ${STRIPPED_BASE}. Run: npm run bootstrap:gzdoom-s`,
  );
}

function isGzdoomSScriptLoaded(): boolean {
  return Boolean(document.querySelector('script[data-gzdoom-s-wasm]'));
}

function loadGzdoomSScript(base: string): Promise<void> {
  // Do not reuse gold /wasm/gzdoom/gzdoom.js — both artifacts export createGzdoomModule on window.
  if (isGzdoomSScriptLoaded() && window.createGzdoomModule) return Promise.resolve();
  if (!isGzdoomSScriptLoaded()) scriptPromise = null;
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-gzdoom-s-wasm]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('gzdoom-s.js load failed')));
      return;
    }
    const s = document.createElement('script');
    s.src = `${base}/gzdoom.js?v=${Date.now()}`;
    s.async = true;
    s.dataset.gzdoomSWasm = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${base}/gzdoom.js`));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

async function fetchPk3Bytes(name: string): Promise<Uint8Array> {
  const res = await fetch(`${GZDOOM_S_PK3_BASE}/${name}`);
  if (!res.ok) {
    throw new GzdoomSPureWasmNotBuiltError(
      `missing pk3 ${name} (${res.status}) in ${GZDOOM_S_PK3_BASE} — run npm run bootstrap:gzdoom-s`,
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}

function mapWarpArgs(map: string): string[] {
  const m = map.match(/^E(\d+)M(\d+)$/i);
  if (m) return ['-warp', m[1]!, m[2]!];
  if (/^MAP\d+$/i.test(map)) return ['+map', map.toUpperCase()];
  throw new Error(`Unsupported map id: ${map}`);
}

async function waitForReady(module: GzdoomWasmModule, timeoutMs = 180_000): Promise<void> {
  const isReady = module._gzr_is_ready;
  if (!isReady) {
    throw new Error('GZDoom (s) WASM missing _gzr_is_ready — rebuild gzdoom-s artifact with hosted ABI');
  }
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (isReady() === 1) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('GZDoom (s) WASM init timed out');
}

export interface GzdoomSPlayOptions {
  canvas: HTMLCanvasElement;
  iwadBytes: Uint8Array;
  iwadName: string;
  map: string;
  gzstateBytes: Uint8Array;
  gzstateName: string;
  layerArgv?: readonly string[];
  onProgress?: GzdoomLoadProgressReporter;
}

function buildSPlayArgv(opts: GzdoomSPlayOptions): string[] {
  return [
    '+vid_hidpi', '0',
    '+vid_fullscreen', '0',
    '+vid_defwidth', String(HOSTED_PLAY_WIDTH),
    '+vid_defheight', String(HOSTED_PLAY_HEIGHT),
    '+vid_preferbackend', '2',
    '+gl_es', '1',
    '+vid_scalemode', '0',
    '+vid_scale_linear', '0',
    '+gl_texture_filter', '0',
    '+screenblocks', '10',
    '+st_scale', '4',
    '+hud_althud', '0',
    '+hud_aspectscale', '1',
    '+wipetype', '0',
    '+vid_fps', '0',
    '+use_mouse', '1',
    '+freelook', '1',
    '+m_noprescale', '1',
    '+i_pauseinbackground', '0',
    '-nosound',
    '-windowed',
    '-iwad', `/wad/${opts.iwadName}`,
    ...mapWarpArgs(opts.map),
    '-loadgzstate', `/wad/${opts.gzstateName}`,
    '-gzrender_play',
    '-gzrender_browser',
    '-gzrender_s',
    ...(opts.layerArgv ?? []),
  ];
}

export async function loadGzdoomSWasm(
  canvas: HTMLCanvasElement,
  onProgress?: GzdoomLoadProgressReporter,
): Promise<GzdoomWasmModule> {
  prepareHostedPlayCanvas(canvas);
  reportGzdoomProgress(onProgress, {
    phase: 'load-script',
    label: 'Loading GZDoom (s) WASM script',
    percent: 40,
  });
  const kind = await resolveGzdoomSArtifactKind();

  if (kind === 'pure') {
    reportGzdoomProgress(onProgress, {
      phase: 'compile-wasm',
      label: 'Compiling pure WASM module',
      percent: 52,
    });
    return loadGzdoomSPureWasm(canvas);
  }

  await loadGzdoomSScript(STRIPPED_BASE);
  reportGzdoomProgress(onProgress, {
    phase: 'compile-wasm',
    label: 'Instantiating WASM module',
    percent: 52,
  });
  const create = window.createGzdoomModule;
  if (!create) {
    throw new Error('createGzdoomModule not on window after gzdoom-s.js load');
  }

  return create({
    canvas,
    locateFile: (p: string) => `${STRIPPED_BASE}/${p}?v=${Date.now()}`,
    noInitialRun: true,
    onAbort: (reason: unknown) => {
      console.error('[gzdoom-s]', reason);
    },
    print: (t: string) => console.log('[gzdoom-s]', t),
    printErr: (t: string) => console.error('[gzdoom-s]', t),
  });
}

export async function runGzdoomSPlay(opts: GzdoomSPlayOptions): Promise<GzdoomWasmModule> {
  const argv = buildSPlayArgv(opts);
  const module = await loadGzdoomSWasm(opts.canvas, opts.onProgress);
  if (!module.FS) {
    throw new Error('GZDoom (s) WASM module missing FS');
  }
  module.FS.mkdirTree('/wad');
  const pk3Total = PK3_FILES.length;
  for (let i = 0; i < pk3Total; i++) {
    const pk3 = PK3_FILES[i]!;
    reportGzdoomProgress(opts.onProgress, {
      phase: 'load-pk3',
      label: 'Loading renderer assets',
      detail: `${i + 1}/${pk3Total}`,
      percent: 58 + Math.round(((i + 1) / pk3Total) * 14),
    });
    module.FS.writeFile(`/${pk3}`, await fetchPk3Bytes(pk3));
  }
  reportGzdoomProgress(opts.onProgress, {
    phase: 'mount-data',
    label: 'Mounting NODE_LUMPS.WAD + GZSTATE',
    detail: `${opts.iwadName} · ${opts.gzstateName}`,
    percent: 76,
  });
  module.FS.writeFile(`/wad/${opts.iwadName}`, opts.iwadBytes);
  module.FS.writeFile(`/wad/${opts.gzstateName}`, opts.gzstateBytes);
  if (typeof module.callMain !== 'function') {
    throw new Error('GZDoom (s) WASM missing callMain');
  }
  reportGzdoomProgress(opts.onProgress, {
    phase: 'init-engine',
    label: 'Starting GZDoom engine',
    detail: opts.map,
    percent: 88,
  });
  try {
    module.callMain(argv);
  } catch (err) {
    console.error('[gzdoom-s] callMain threw at startup', err);
    throw err;
  }
  await waitForReady(module);
  reportGzdoomProgress(opts.onProgress, {
    phase: 'ready',
    label: 'Ready',
    percent: 100,
  });
  return module;
}

export async function runGzdoomSCapture(opts: {
  canvas: HTMLCanvasElement;
  iwadBytes: Uint8Array;
  iwadName: string;
  map: string;
  gzstateBytes: Uint8Array;
  gzstateName: string;
}): Promise<GzdoomWasmModule> {
  const args = buildParityCaptureArgv('full');
  args.push(
    '-iwad', `/wad/${opts.iwadName}`,
    ...mapWarpArgs(opts.map),
    '-gzrender_only',
    '-gzrender_browser',
    '-gzrender_s',
    '-loadgzstate', `/wad/${opts.gzstateName}`,
    '-gzstate_refframe', `/wad/${opts.map}-ref.png`,
  );
  const module = await loadGzdoomSWasm(opts.canvas);
  if (!module.FS) throw new Error('GZDoom (s) WASM missing FS');
  module.FS.mkdirTree('/wad');
  for (const pk3 of PK3_FILES) {
    module.FS.writeFile(`/${pk3}`, await fetchPk3Bytes(pk3));
  }
  module.FS.writeFile(`/wad/${opts.iwadName}`, opts.iwadBytes);
  module.FS.writeFile(`/wad/${opts.gzstateName}`, opts.gzstateBytes);
  module.callMain!(args);
  await waitForReady(module);
  return module;
}
