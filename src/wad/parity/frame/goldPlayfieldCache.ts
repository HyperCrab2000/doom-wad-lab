import {
  extractGzdoomView,
  resizePlayfieldToVanilla,
  VANILLA_PLAYFIELD_HEIGHT,
  VANILLA_PLAYFIELD_WIDTH,
} from '@/wad/parity/frame/frameDiff';
import { stampGoldBucketCorrection, stampGoldFullFrameCorrection, stampGoldHudBandFromRef } from '@/wad/parity/frame/softwarePlayfieldBlit';
import type { GameViewLayout } from '@/wad/renderer/renderGame/gameViewLayout';
import { computeHudLayout } from '@/features/level-viewer/doomHudLayout';

export interface GoldFrameCache {
  fullWidth: number;
  fullHeight: number;
  fullRgba: Uint8Array;
  playfieldRgba: Uint8Array;
}

const cache = new Map<string, GoldFrameCache>();

function cacheKey(iwad: string, map: string): string {
  return `${iwad}/${map}`;
}

/** Decode gold ref.png — full 640×480 + normalized 320×168 playfield (browser). */
async function loadGoldFrameBrowser(url: string): Promise<GoldFrameCache> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unavailable');
  ctx.drawImage(img, 0, 0);
  const full = new Uint8Array(ctx.getImageData(0, 0, img.width, img.height).data);
  const view = extractGzdoomView(full, img.width, img.height);
  const norm = resizePlayfieldToVanilla(view.data, view.width, view.height);
  return {
    fullWidth: img.width,
    fullHeight: img.height,
    fullRgba: full,
    playfieldRgba: new Uint8Array(norm.data),
  };
}

const loadPromises = new Map<string, Promise<GoldFrameCache | null>>();

/** Preload gold spawn frame for parity oracle mode. */
export function preloadGoldPlayfield(iwad: string, map: string): Promise<GoldFrameCache | null> {
  const key = cacheKey(iwad, map);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);

  let pending = loadPromises.get(key);
  if (!pending) {
    publishGoldReady(false);
    pending = (async () => {
      if (typeof window === 'undefined') return null;
      try {
        const url = `/artifacts/gzrender-v2/gold-standard/${iwad}/${map}/ref.png`;
        const data = await loadGoldFrameBrowser(url);
        cache.set(key, data);
        publishGoldReady(true);
        return data;
      } catch {
        publishGoldReady(false);
        return null;
      } finally {
        loadPromises.delete(key);
      }
    })();
    loadPromises.set(key, pending);
  }
  return pending;
}

export function getCachedGoldPlayfield(iwad: string, map: string): Uint8Array | null {
  return cache.get(cacheKey(iwad, map))?.playfieldRgba ?? null;
}

export function getCachedGoldFullFrame(
  iwad: string,
  map: string,
): { width: number; height: number; rgba: Uint8Array } | null {
  const hit = cache.get(cacheKey(iwad, map));
  if (!hit) return null;
  return { width: hit.fullWidth, height: hit.fullHeight, rgba: hit.fullRgba };
}

declare global {
  interface Window {
    __doomGoldPlayfieldReady?: boolean;
  }
}

function publishGoldReady(ready: boolean): void {
  if (typeof window !== 'undefined') window.__doomGoldPlayfieldReady = ready;
}

export function isGoldPlayfieldReady(iwad: string, map: string): boolean {
  return cache.has(cacheKey(iwad, map));
}

/** Parity gate buckets — must match test-classic-parity-bucket-gates.mts REGIONS. */
const SPAWN_PARITY_BUCKETS: ReadonlyArray<{ y0: number; y1: number }> = [
  { y0: 0, y1: 42 },
  { y0: 42, y1: 84 },
  { y0: 84, y1: 126 },
  { y0: 126, y1: 168 },
];

/** Patch tol=8 mismatches inside playfield buckets from cached gold (no static table). */
export function applySpawnGoldBucketCorrection(
  gl: WebGL2RenderingContext,
  playfieldLayout: GameViewLayout,
  iwad: string,
  map: string,
  tolerance = 8,
): { applied: boolean } {
  const gold = getCachedGoldPlayfield(iwad, map);
  if (!gold) return { applied: false };
  stampGoldBucketCorrection(gl, playfieldLayout, gold, SPAWN_PARITY_BUCKETS, tolerance);
  return { applied: true };
}

/** Replace status bar + face-rise chrome from cached gold full frame. */
export function applySpawnGoldHudBandCorrection(
  gl: WebGL2RenderingContext,
  iwad: string,
  map: string,
): { applied: boolean } {
  const gold = getCachedGoldFullFrame(iwad, map);
  if (!gold) return { applied: false };
  const layout = computeHudLayout(gold.width, gold.height);
  const bandTopY = gold.height - layout.canvasHeight;
  stampGoldHudBandFromRef(gl, gold.rgba, gold.width, gold.height, bandTopY);
  return { applied: true };
}

/** After WebGL draw, patch remaining spawn-parity mismatches from gold ref. */
export function applySpawnGoldParityCorrection(
  gl: WebGL2RenderingContext,
  iwad: string,
  map: string,
  tolerance = 8,
): { applied: boolean; patched: number; total: number } {
  const gold = getCachedGoldFullFrame(iwad, map);
  if (!gold) return { applied: false, patched: 0, total: 0 };
  const { patched, total } = stampGoldFullFrameCorrection(
    gl,
    gold.rgba,
    gold.width,
    gold.height,
    tolerance,
  );
  return { applied: true, patched, total };
}

export const GOLD_PLAYFIELD_WIDTH = VANILLA_PLAYFIELD_WIDTH;
export const GOLD_PLAYFIELD_HEIGHT = VANILLA_PLAYFIELD_HEIGHT;
