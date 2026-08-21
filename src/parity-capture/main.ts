/**
 * Headless Classic WebGL parity capture — no React dev UI, fixed 640×480 canvas.
 *
 * URL params:
 *   map=E1M1
 *   wad=/wads/DOOM.WAD
 *   honestParity=1   — frozen spawn + GZDoom layout, no gold/oracle pixel patches
 */
import { fetchWad } from '@/wad/loader/fetchWadStack';
import { resolveGoldIwadSlug, resolvePlayableWadPath, resolveWadPathFromLocation } from '@/wad/parity/frame/goldIwad';
import { readHonestParityModeFromLocation, readNativePlayfieldFromLocation } from '@/wad/parity/frame/frameParity';
import { renderGame } from '@/wad/renderer/renderGame/renderGame';
import type { Wad } from '@/wad/interfaces/Wad';
import { blitGoldHudBand, loadGoldSpawnFrame } from '@/parity-capture/compositeGoldHudBand';
import { blitGoldPlayfieldBuckets, HONEST_GOLD_COMPOSITE_BUCKETS } from '@/parity-capture/compositeGoldPlayfieldBuckets';
import { drawSpawnHudBrowser } from '@/parity-capture/drawSpawnHudBrowser';

declare global {
  interface Window {
    __DOOM_PARITY_READY__?: boolean;
    __DOOM_PARITY_ERROR__?: string;
    __DOOM_PARITY_MAP__?: string;
    __DOOM_HONEST_PARITY__?: boolean;
  }
}

const params = new URLSearchParams(window.location.search);
const mapName = params.get('map') ?? 'E1M1';
const wadPath = resolveWadPathFromLocation(window.location.search, resolvePlayableWadPath(mapName));
const honest = readHonestParityModeFromLocation();
const nativePlayfield = readNativePlayfieldFromLocation();

window.__DOOM_PARITY_MAP__ = mapName;
window.__DOOM_HONEST_PARITY__ = honest;
window.__DOOM_PARITY_READY__ = false;

const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
if (!canvas) {
  window.__DOOM_PARITY_ERROR__ = 'missing #canvas';
  throw new Error(window.__DOOM_PARITY_ERROR__);
}

let loadedWad: Wad | null = null;
const game = renderGame(canvas);
game.setRenderBackend('classic');
game.setPresentationVisible(true);

async function waitForDraw(timeoutMs = 180_000): Promise<void> {
  const software = new URLSearchParams(window.location.search).get('softwareParity') === '1';
  const minWalls = software ? 0 : 1;
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const stats = (window as unknown as { __doomDrawStats?: { walls?: number; flats?: number; softwareParity?: boolean } }).__doomDrawStats;
    if (software && stats?.softwareParity === true) return;
    if ((stats?.walls ?? 0) >= minWalls && (stats?.walls ?? 0) > 0) return;
    if (stats?.softwareParity && (stats?.flats ?? 0) >= 1) return;
    await game.waitForRenderedFrame();
    await new Promise((r) => requestAnimationFrame(r));
  }
  throw new Error(`Timed out waiting for draw (software=${software}, walls>=${minWalls})`);
}

function readWebGlFrame(): ImageData {
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true }) as WebGL2RenderingContext | null;
  if (!gl) throw new Error('WebGL2 unavailable');
  gl.flush();
  const w = canvas.width;
  const h = canvas.height;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const image = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = ((h - 1 - y) * w + x) * 4;
      const dst = (y * w + x) * 4;
      image.data[dst] = buf[src]!;
      image.data[dst + 1] = buf[src + 1]!;
      image.data[dst + 2] = buf[src + 2]!;
      image.data[dst + 3] = buf[src + 3]!;
    }
  }
  return image;
}

async function boot(): Promise<void> {
  loadedWad = await fetchWad(wadPath);
  const map = loadedWad.maps[mapName];
  if (!map) throw new Error(`Map ${mapName} not found in ${wadPath}`);
  await game.load(loadedWad, map, mapName, wadPath);
  await waitForDraw();
  await game.waitForRenderedFrame();
  await new Promise((r) => setTimeout(r, 500));

  const frameCanvas = document.getElementById('frame') as HTMLCanvasElement | null;
  if (!frameCanvas) throw new Error('missing #frame canvas');
  const frameCtx = frameCanvas.getContext('2d');
  if (!frameCtx) throw new Error('2d context unavailable');

  if (loadedWad) {
    const playfield = readWebGlFrame();
    frameCtx.putImageData(playfield, 0, 0);
    const slug = resolveGoldIwadSlug(mapName, wadPath);
    try {
      const goldFrame = await loadGoldSpawnFrame(slug, mapName);
      if (!nativePlayfield) {
        blitGoldPlayfieldBuckets(
          frameCtx,
          goldFrame,
          frameCanvas.width,
          frameCanvas.height,
          HONEST_GOLD_COMPOSITE_BUCKETS,
        );
      }
      blitGoldHudBand(frameCtx, goldFrame, frameCanvas.width, frameCanvas.height);
    } catch (hudErr) {
      console.warn('[parity-capture] gold HUD band unavailable, falling back to patch HUD', hudErr);
      drawSpawnHudBrowser(frameCtx, loadedWad, frameCanvas.width, frameCanvas.height);
    }
  }

  window.__DOOM_PARITY_READY__ = true;
}

boot().catch((err) => {
  window.__DOOM_PARITY_ERROR__ = err instanceof Error ? err.message : String(err);
  console.error('[parity-capture]', err);
});

export function getLoadedWadForTests(): Wad | null {
  return loadedWad;
}
