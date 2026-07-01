/**
 * Load stripped GZDoom WASM in browser with MEMFS IWAD + gzstate args.
 */

import { buildParityCaptureArgv, type DisplayModeId } from './parityDisplayModes';
import {
  reportGzdoomProgress,
  type GzdoomLoadProgressReporter,
} from '@/features/level-viewer/gzdoomPlayLoadProgress';

declare global {
  interface Window {
    createGzdoomModule?: (opts: Record<string, unknown>) => Promise<GzdoomWasmModule>;
  }
}

export interface GzdoomWasmModule {
  FS?: {
    mkdirTree: (path: string) => void;
    writeFile: (path: string, data: Uint8Array | string) => void;
    readFile: (path: string, opts?: { encoding?: 'binary' }) => Uint8Array;
  };
  callMain?: (args: string[]) => number;
  canvas?: HTMLCanvasElement;
  /** Host-driven renderer ABI (exported from gzdoom.wasm). */
  _gzr_set_view?: (x: number, y: number, yaw: number, pitch: number) => void;
  _gzr_is_ready?: () => number;
  _gzr_on_pointer_lock?: (locked: number) => void;
  _gzr_mouse_move?: (dx: number, dy: number) => void;
  /**
   * Drains the decoupled SFX event queue as a JSON array string (see gzstate_dump.cpp). Returns a
   * char pointer — a Number on wasm32 but a BigInt on MEMORY64 (wasm64), so callers must coerce.
   */
  _gzr_poll_sound_events?: () => number | bigint;
  /** Run a GZDoom console command (e.g. `+gl_render_walls 0`) on the live module. */
  _gzr_exec_cmd?: (cmdPtr: number | bigint) => void;
  /** Emscripten runtime helper to read a C string pointer from WASM memory. */
  UTF8ToString?: (ptr: number) => string;
  stringToUTF8?: (str: string, outPtr: number, maxBytes?: number) => void;
  stackAlloc?: (size: number) => number | bigint;
  lengthBytesUTF8?: (str: string) => number;
  /**
   * Emscripten MainLoop.pause — halts this module's render/sim rAF loop. GZDoom WASM cannot cleanly
   * exit, so on teardown (e.g. switching renderers) we pause the old instance's loop; otherwise the
   * dead module keeps running and contends with the new one. (Module["pauseMainLoop"] is exported.)
   */
  pauseMainLoop?: () => void;
}

export interface GzdoomRunResult {
  module: GzdoomWasmModule;
  /** PNG bytes from canvas after render (canonical Step 2 capture). */
  canvasPngBytes?: Uint8Array;
  /** PNG bytes from `-gzstate_refframe` MEMFS path, when gzstate was loaded. */
  refFrameBytes?: Uint8Array;
  /** GZDRAW v1 bytes from `-gzdraw_dump` MEMFS path, when gzdraw capture was requested. */
  gzdrawBytes?: Uint8Array;
}

export interface GzdoomRunOptions {
  canvas: HTMLCanvasElement;
  iwadBytes: Uint8Array;
  iwadName: string;
  map: string;
  gzstateBytes?: Uint8Array;
  gzstateName?: string;
  onProgress?: GzdoomLoadProgressReporter;
  /** Layered debug display mode (console CVAR overrides). */
  displayMode?: DisplayModeId;
  /** Playfield coords for `-gzrender_probe x,y` (320×168). */
  renderProbe?: string;
  /** `-gzrender_shader_debug N` fragment diagnostic mode (0=off). */
  shaderDebugMode?: number;
  /** Camera override for `-gzrender_view x,y,yaw[,pitch]` (map units + degrees). */
  renderView?: string;
  /** MEMFS path for `-gzdraw_dump` (e.g. `/wad/E1M1.gzdraw`). */
  gzdrawDumpPath?: string;
  /** View-probe id for corpus naming (`-gzdraw_probe_id`). */
  probeId?: number;
}

/** Interactive Play-tab render resolution (4:3 to match GZDoom's pixel-aspect). Parity capture
 *  stays at 640x480; this only affects the live hosted renderer. */
const HOSTED_PLAY_WIDTH = 1280;
const HOSTED_PLAY_HEIGHT = 960;

/** Set canvas backing-store size before Emscripten binds GL. Resizing clears any prior context. */
export function prepareHostedPlayCanvas(
  canvas: HTMLCanvasElement,
  width = HOSTED_PLAY_WIDTH,
  height = HOSTED_PLAY_HEIGHT,
): void {
  canvas.width = width;
  canvas.height = height;
}

const PK3_FILES = [
  'gzdoom.pk3',
  'gzdoom-wasm-shaders.pk3',
  'game_support.pk3',
  'game_widescreen_gfx.pk3',
  'brightmaps.pk3',
  'lights.pk3',
] as const;

let scriptPromise: Promise<void> | null = null;

function loadGzdoomScript(): Promise<void> {
  if (window.createGzdoomModule) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-gzdoom-wasm]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('gzdoom.js load failed')));
      return;
    }
    const s = document.createElement('script');
    s.src = '/wasm/gzdoom/gzdoom.js';
    s.async = true;
    s.dataset.gzdoomWasm = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load /wasm/gzdoom/gzdoom.js'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

async function fetchPk3Bytes(name: string): Promise<Uint8Array> {
  const res = await fetch(`/wasm/gzdoom/${name}`);
  if (!res.ok) throw new Error(`Missing pk3 ${name} (${res.status}) — run npm run build:gzdoom-wasm`);
  return new Uint8Array(await res.arrayBuffer());
}

function mapWarpArgs(map: string): string[] {
  const m = map.match(/^E(\d+)M(\d+)$/i);
  if (m) return ['-warp', m[1]!, m[2]!];
  if (/^MAP\d+$/i.test(map)) return ['+map', map.toUpperCase()];
  throw new Error(`Unsupported map id: ${map}`);
}

/** Default MEMFS path for `-gzdraw_dump` (matches corpus probe naming). */
function defaultGzdrawMemfsPath(map: string, probeId?: number): string {
  if (probeId != null) return `/wad/probe-${probeId}.gzdraw`;
  return `/wad/${map}.gzdraw`;
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))), 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
}

function buildArgv(opts: GzdoomRunOptions): string[] {
  const renderMode = opts.gzdrawDumpPath ? '4' : '0';
  const args = buildParityCaptureArgv(opts.displayMode ?? 'full', { vidRenderMode: renderMode });
  args.push('-iwad', `/wad/${opts.iwadName}`, ...mapWarpArgs(opts.map), '-gzrender_only', '-gzrender_browser');
  if (opts.gzstateBytes && opts.gzstateName) {
    args.push('-loadgzstate', `/wad/${opts.gzstateName}`);
    if (!opts.gzdrawDumpPath) {
      args.push('-gzstate_refframe', `/wad/${opts.map}-ref.png`);
    }
  }
  if (opts.renderProbe) {
    args.push('-gzrender_probe', opts.renderProbe);
  }
  if (opts.shaderDebugMode != null && opts.shaderDebugMode > 0) {
    args.push('-gzrender_shader_debug', String(opts.shaderDebugMode));
  }
  if (opts.renderView) {
    args.push('-gzrender_view', opts.renderView);
  }
  if (opts.gzdrawDumpPath) {
    args.push('-gzdraw_dump', opts.gzdrawDumpPath);
  }
  if (opts.probeId != null) {
    args.push('-gzdraw_probe_id', String(opts.probeId));
  }
  return args;
}

export interface GzdoomHostedOptions {
  canvas: HTMLCanvasElement;
  iwadBytes: Uint8Array;
  iwadName: string;
  map: string;
  gzstateBytes: Uint8Array;
  gzstateName: string;
}

/**
 * Hosted renderer argv: same vid/GLES baseline as parity capture, plus gzstate load.
 * Uses GZRenderOnly (frozen sim + GZDoom GLES renderer) with -gzrender_hosted so the
 * runtime stays alive and the JS host drives the camera via gzr_set_view().
 * NO -gzstate_refframe (no capture-and-exit).
 */
function buildHostedArgv(opts: GzdoomHostedOptions): string[] {
  // Renderer-only core = parity/capture path → keep the deterministic 640x480 parity baseline.
  // (Interactive high-res quality lives in buildPlayArgv, the playable monolith Play tab.)
  const args = buildParityCaptureArgv('full');
  args.push(
    '-iwad',
    `/wad/${opts.iwadName}`,
    ...mapWarpArgs(opts.map),
    '-gzrender_only',
    '-gzrender_hosted',
    '-gzrender_browser',
    '-loadgzstate',
    `/wad/${opts.gzstateName}`,
  );
  return args;
}

export interface GzdoomPlayOptions {
  canvas: HTMLCanvasElement;
  iwadBytes: Uint8Array;
  iwadName: string;
  map: string;
  /** Layers panel → +cvar argv pairs applied at callMain (GZDoom parses, not JS). */
  layerArgv?: readonly string[];
  onProgress?: GzdoomLoadProgressReporter;
}

/**
 * Fully-playable argv: GZDoom's real game loop in the browser via -gzrender_play.
 * Unlike parity/hosted capture, this keeps player sprites (weapon) and the game sim running.
 * 640×480 windowed render (canvas backing) scaled up by CSS; sound off; autostart the map.
 */
function buildPlayArgv(opts: GzdoomPlayOptions): string[] {
  return [
    '+vid_hidpi', '0',
    '+vid_fullscreen', '0',
    // vid_def* drives GZRender_MaybePlayResize()'s SetWindowSize → canvas backing buffer.
    '+vid_defwidth', String(HOSTED_PLAY_WIDTH),
    '+vid_defheight', String(HOSTED_PLAY_HEIGHT),
    '+vid_preferbackend', '2',
    '+gl_es', '1',
    '+vid_scalemode', '0',
    // Match the pixel-perfect parity path: nearest filtering, NO mipmaps. gl_texture_filter 4
    // (trilinear) builds mipmaps, and the WASM GLES mipmap path drops levels — distant / grazing /
    // small-triangle surfaces then sample empty mips and render as missing/wrong textures. Nearest
    // also gives the crisp authentic-Doom look (trilinear just blurs it).
    '+vid_scale_linear', '0',
    '+gl_texture_filter', '0',
    // Authentic full-width classic Doom status bar (STBAR + marine face). screenblocks 10 = play
    // view above the bar. The Doom sbar uses GetUIScale(twod, st_scale) as a literal scale factor
    // clamped to w/320 (=4 at 1280): st_scale 1 → 1x (~39px strip), st_scale 0 → clean auto (2x,
    // centered 640px), st_scale 4 → full-width 4x bar (SBarTop≈806, ~154px tall, spans the screen).
    // hud_aspectscale 1 keeps the vanilla 1.2 vertical stretch.
    '+screenblocks', '10',
    '+st_scale', '4',
    '+hud_althud', '0',
    '+hud_aspectscale', '1',
    '+wipetype', '0',
    // GZDoom's plain in-canvas FPS text is replaced by the DOM PerfMeter overlay (numeric + live
    // sparkline) in LevelViewer, so disable the engine's own counter to avoid a duplicate readout.
    '+vid_fps', '0',
    // Mouse look/turn: relative mouse (pointer lock) drives yaw; freelook adds vertical look.
    '+use_mouse', '1',
    '+freelook', '1',
    '+m_noprescale', '1',
    // Browser SDL reports no window focus, which can set paused/pauseext → System_CaptureModeInGame
    // returns false → mouse capture (turning) never engages. Never pause on background in the tab.
    '+i_pauseinbackground', '0',
    // Keep the in-engine OpenAL renderer OFF (NullSoundRenderer). Initializing Emscripten's
    // OpenAL → WebAudio device during D_DoomMain hangs browser startup, so SFX are NOT driven by
    // the WASM audio backend. Instead the game pushes sound events to JS, which plays them through
    // a decoupled WebAudio SFX player (mirrors the music path). -nosound forces NullSoundRenderer
    // (i_sound.cpp re-reads this arg), which still runs the sound engine so events can be emitted.
    '-nosound',
    '-windowed',
    '-iwad', `/wad/${opts.iwadName}`,
    ...mapWarpArgs(opts.map),
    '-gzrender_play',
    '-gzrender_browser',
    ...(opts.layerArgv ?? []),
  ];
}

async function waitForHostedReady(module: GzdoomWasmModule, timeoutMs = 180_000): Promise<void> {
  const isReady = module._gzr_is_ready;
  if (!isReady) {
    throw new Error('GZDoom WASM missing _gzr_is_ready export — rebuild with hosted ABI');
  }
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (isReady() === 1) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('GZDoom hosted renderer init timed out');
}

/**
 * Start GZDoom's renderer in WASM (host-driven). GZRenderOnly freezes game sim; the host
 * sets camera via gzr_set_view(); GZDoom's own GLES→WebGL2 path renders each frame.
 */
export async function runGzdoomHosted(opts: GzdoomHostedOptions): Promise<GzdoomWasmModule> {
  const argv = buildHostedArgv(opts);
  const module = await loadGzdoomWasm(opts.canvas);
  if (!module.FS) {
    throw new Error('GZDoom WASM module missing FS (MEMFS not linked)');
  }
  module.FS.mkdirTree('/wad');
  for (const pk3 of PK3_FILES) {
    const bytes = await fetchPk3Bytes(pk3);
    module.FS.writeFile(`/${pk3}`, bytes);
  }
  module.FS.writeFile(`/wad/${opts.iwadName}`, opts.iwadBytes);
  module.FS.writeFile(`/wad/${opts.gzstateName}`, opts.gzstateBytes);
  if (typeof module.callMain !== 'function') {
    throw new Error('GZDoom WASM missing callMain');
  }
  try {
    module.callMain(argv);
  } catch (err) {
    console.error('[gzdoom] hosted callMain threw at startup', err);
    throw err;
  }
  await waitForHostedReady(module);
  return module;
}

/**
 * Run fully-playable GZDoom in WASM (real game loop + input via SDL/emscripten). The browser
 * canvas is the SDL window; GZDoom renders each frame through its own GLES→WebGL2 path.
 */
export async function runGzdoomPlay(opts: GzdoomPlayOptions): Promise<GzdoomWasmModule> {
  const argv = buildPlayArgv(opts);
  const module = await loadGzdoomWasm(opts.canvas, opts.onProgress);
  if (!module.FS) {
    throw new Error('GZDoom WASM module missing FS (MEMFS not linked)');
  }
  module.FS.mkdirTree('/wad');
  const pk3Total = PK3_FILES.length;
  for (let i = 0; i < pk3Total; i++) {
    const pk3 = PK3_FILES[i]!;
    reportGzdoomProgress(opts.onProgress, {
      phase: 'load-pk3',
      label: 'Loading GZDoom assets',
      detail: `${i + 1}/${pk3Total}`,
      percent: 48 + Math.round(((i + 1) / pk3Total) * 22),
    });
    const bytes = await fetchPk3Bytes(pk3);
    module.FS.writeFile(`/${pk3}`, bytes);
  }
  reportGzdoomProgress(opts.onProgress, {
    phase: 'mount-data',
    label: 'Mounting raw IWAD',
    detail: opts.iwadName,
    percent: 74,
  });
  module.FS.writeFile(`/wad/${opts.iwadName}`, opts.iwadBytes);
  if (typeof module.callMain !== 'function') {
    throw new Error('GZDoom WASM missing callMain');
  }
  reportGzdoomProgress(opts.onProgress, {
    phase: 'init-engine',
    label: 'Starting GZDoom engine',
    detail: opts.map,
    percent: 86,
  });
  try {
    module.callMain(argv);
  } catch (err) {
    console.error('[gzdoom] play callMain threw at startup', err);
    throw err;
  }
  await waitForHostedReady(module);
  reportGzdoomProgress(opts.onProgress, {
    phase: 'ready',
    label: 'Ready',
    percent: 100,
  });
  return module;
}

export async function loadGzdoomWasm(
  canvas: HTMLCanvasElement,
  onProgress?: GzdoomLoadProgressReporter,
): Promise<GzdoomWasmModule> {
  reportGzdoomProgress(onProgress, {
    phase: 'load-script',
    label: 'Loading GZDoom WASM script',
    percent: 22,
  });
  await loadGzdoomScript();
  reportGzdoomProgress(onProgress, {
    phase: 'compile-wasm',
    label: 'Compiling WASM module',
    percent: 38,
  });
  const create = window.createGzdoomModule;
  if (!create) throw new Error('createGzdoomModule not on window after gzdoom.js load');

  prepareHostedPlayCanvas(canvas);

  return create({
    canvas,
    locateFile: (p: string) => `/wasm/gzdoom/${p}?v=${Date.now()}`,
    noInitialRun: true,
    onAbort: (reason: unknown) => {
      console.error('[gzdoom] onAbort', reason);
    },
    print: (t: string) => console.log('[gzdoom]', t),
    printErr: (t: string) => console.error('[gzdoom]', t),
  });
}

export async function runGzdoomMap(opts: GzdoomRunOptions): Promise<GzdoomRunResult> {
  const gzdrawDumpPath =
    opts.gzdrawDumpPath ?? (opts.renderView != null ? defaultGzdrawMemfsPath(opts.map, opts.probeId) : undefined);
  const argv = buildArgv({ ...opts, gzdrawDumpPath });
  const module = await loadGzdoomWasm(opts.canvas, opts.onProgress);

  if (!module.FS) {
    throw new Error('GZDoom WASM module missing FS (MEMFS not linked)');
  }

  module.FS.mkdirTree('/wad');
  const pk3Total = PK3_FILES.length;
  for (let i = 0; i < pk3Total; i++) {
    const pk3 = PK3_FILES[i]!;
    reportGzdoomProgress(opts.onProgress, {
      phase: 'load-pk3',
      label: 'Loading GZDoom assets',
      detail: `${i + 1}/${pk3Total}`,
      percent: 52 + Math.round(((i + 1) / pk3Total) * 20),
    });
    const bytes = await fetchPk3Bytes(pk3);
    module.FS.writeFile(`/${pk3}`, bytes);
  }
  module.FS.writeFile(`/wad/${opts.iwadName}`, opts.iwadBytes);
  if (opts.gzstateBytes && opts.gzstateName) {
    module.FS.writeFile(`/wad/${opts.gzstateName}`, opts.gzstateBytes);
  }

  if (typeof module.callMain !== 'function') {
    throw new Error('GZDoom WASM missing callMain');
  }

  reportGzdoomProgress(opts.onProgress, {
    phase: 'init-engine',
    label: 'Capturing spawn frame',
    detail: opts.map,
    percent: 88,
  });

  let callMainError: unknown;
  try {
    const code = module.callMain(argv);
    if (code !== 0) {
      throw new Error(`GZDoom callMain exited ${code} argv=${argv.join(' ')}`);
    }
  } catch (err) {
    callMainError = err;
  }

  let canvasPngBytes: Uint8Array | undefined;
  try {
    canvasPngBytes = await canvasToPngBytes(opts.canvas);
  } catch {
    // canvas export optional; puppeteer clip fallback remains
  }

  let refFrameBytes: Uint8Array | undefined;
  if (opts.gzstateBytes && !gzdrawDumpPath) {
    const refPath = `/wad/${opts.map}-ref.png`;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        refFrameBytes = module.FS.readFile(refPath, { encoding: 'binary' });
        if (refFrameBytes.length > 0) break;
      } catch {
        refFrameBytes = undefined;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    if (!refFrameBytes?.length && !callMainError) {
      throw new Error(`GZDoom did not write reference frame at ${refPath}`);
    }
  }

  let gzdrawBytes: Uint8Array | undefined;
  if (gzdrawDumpPath) {
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        gzdrawBytes = module.FS.readFile(gzdrawDumpPath, { encoding: 'binary' });
        if (gzdrawBytes.length > 0) break;
      } catch {
        gzdrawBytes = undefined;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    if (!gzdrawBytes?.length && !callMainError) {
      throw new Error(`GZDoom did not write GZDRAW dump at ${gzdrawDumpPath}`);
    }
  }

  if (callMainError) {
    const msg = callMainError instanceof Error ? callMainError.message : String(callMainError);
    const stdioNoise = msg.includes('stdio streams had content') || msg.includes('not flushed');
    const gotOutput =
      (refFrameBytes?.length ?? 0) > 0 || (gzdrawBytes?.length ?? 0) > 0 || (canvasPngBytes?.length ?? 0) > 0;
    if (!stdioNoise || !gotOutput) {
      throw callMainError;
    }
    console.warn('[gzdoom] ignoring post-run stdio flush warning');
  }

  return { module, canvasPngBytes, refFrameBytes, gzdrawBytes };
}

export { buildArgv, buildParityCaptureArgv, defaultGzdrawMemfsPath, mapWarpArgs };
