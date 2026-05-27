import React, { useCallback, useEffect, useRef } from 'react';
import {
  drawDoomLoadingScreen,
  drawLoadingStaticNoise,
} from './doomLoadingScreen';

const WIPE_DURATION_MS = 2400;
const MELT_COLUMNS = 160;
const LOADING_ANIM_MS = 450;
const STATIC_FLICKER_MS = 90;

function createMeltState(height: number): { offset: Float32Array; speed: Float32Array } {
  const offset = new Float32Array(MELT_COLUMNS);
  const speed = new Float32Array(MELT_COLUMNS);
  for (let i = 0; i < MELT_COLUMNS; i++) {
    offset[i] = -Math.random() * height * 0.12;
    speed[i] = (height / WIPE_DURATION_MS) * 1000 * (0.75 + Math.random() * 0.55);
  }
  return { offset, speed };
}

function syncCanvasSize(
  overlay: HTMLCanvasElement,
  loading: HTMLCanvasElement,
  width: number,
  height: number
): void {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (overlay.width !== w || overlay.height !== h) {
    overlay.width = w;
    overlay.height = h;
  }
  if (loading.width !== w || loading.height !== h) {
    loading.width = w;
    loading.height = h;
  }
}

function captureGameFrame(
  gameCanvas: HTMLCanvasElement,
  target: HTMLCanvasElement,
  width: number,
  height: number
): boolean {
  const ctx = target.getContext('2d');
  if (!ctx) return false;

  target.width = width;
  target.height = height;
  ctx.imageSmoothingEnabled = false;

  const gl = gameCanvas.getContext('webgl2');
  if (gl && gameCanvas.width > 0 && gameCanvas.height > 0) {
    const readW = gameCanvas.width;
    const readH = gameCanvas.height;
    const pixels = new Uint8Array(readW * readH * 4);
    gl.readPixels(0, 0, readW, readH, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    const scratch = document.createElement('canvas');
    scratch.width = readW;
    scratch.height = readH;
    const scratchCtx = scratch.getContext('2d');
    if (scratchCtx) {
      const imageData = scratchCtx.createImageData(readW, readH);
      for (let y = 0; y < readH; y++) {
        const srcRow = (readH - 1 - y) * readW * 4;
        const dstRow = y * readW * 4;
        imageData.data.set(pixels.subarray(srcRow, srcRow + readW * 4), dstRow);
      }
      scratchCtx.putImageData(imageData, 0, 0);
      ctx.drawImage(scratch, 0, 0, readW, readH, 0, 0, width, height);
      return true;
    }
  }

  if (gameCanvas.width < 1 || gameCanvas.height < 1) {
    return false;
  }

  try {
    ctx.drawImage(gameCanvas, 0, 0, width, height);
    return true;
  } catch {
    return false;
  }
}

export type LevelTransitionPhase = 'loading' | 'static' | 'wipe';

export const DoomLevelTransition: React.FC<{
  active: boolean;
  phase: LevelTransitionPhase;
  wad: import('@/wad/interfaces/Wad').Wad | null;
  mapLabel?: string;
  gameCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  onComplete: () => void;
  onSnapshotCaptured?: () => void;
}> = ({ active, phase, wad, mapLabel, gameCanvasRef, viewportRef, onComplete, onSnapshotCaptured }) => {
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const loadingRef = useRef<HTMLCanvasElement>(null);
  const snapshotRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const loadingAnimRef = useRef<number | null>(null);
  const staticAnimRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onSnapshotCapturedRef = useRef(onSnapshotCaptured);
  onCompleteRef.current = onComplete;
  onSnapshotCapturedRef.current = onSnapshotCaptured;

  const loadingMessage = useCallback(
    (dots = 3) => {
      const base = mapLabel ? `LOADING ${mapLabel}` : 'LOADING';
      return `${base}${'.'.repeat(dots)}`;
    },
    [mapLabel]
  );

  const paintLoadingScreen = useCallback(
    (message?: string, withStatic = false) => {
      const overlay = overlayRef.current;
      const loading = loadingRef.current;
      if (!overlay || !loading || !wad) return;

      const viewport = viewportRef.current;
      if (viewport) {
        syncCanvasSize(overlay, loading, viewport.clientWidth, viewport.clientHeight);
      }

      const msg = message ?? loadingMessage(3);
      drawDoomLoadingScreen(loading, wad, msg);
      const ctx = overlay.getContext('2d');
      if (!ctx) return;

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(loading, 0, 0, overlay.width, overlay.height);
      if (withStatic) {
        drawLoadingStaticNoise(ctx, overlay.width, overlay.height, 0.18);
      }
    },
    [loadingMessage, viewportRef, wad]
  );

  const runWipe = useCallback(() => {
    const overlay = overlayRef.current;
    const loading = loadingRef.current;
    const gameCanvas = gameCanvasRef.current;
    if (!overlay || !loading || !gameCanvas) {
      return false;
    }

    const ctx = overlay.getContext('2d');
    if (!ctx) return false;

    const w = overlay.width;
    const h = overlay.height;
    if (w < 1 || h < 1) {
      return false;
    }

    let gameSnapshot = snapshotRef.current;
    if (!gameSnapshot) {
      gameSnapshot = document.createElement('canvas');
      snapshotRef.current = gameSnapshot;
    }

    if (!captureGameFrame(gameCanvas, gameSnapshot, w, h)) {
      return false;
    }

    onSnapshotCapturedRef.current?.();
    paintLoadingScreen(loadingMessage(3), false);

    const melt = createMeltState(h);
    const columnWidth = w / MELT_COLUMNS;
    const start = performance.now();
    let lastFrame = start;

    const frame = (now: number) => {
      const dt = Math.min(48, now - lastFrame);
      lastFrame = now;
      const elapsed = now - start;

      for (let col = 0; col < MELT_COLUMNS; col++) {
        melt.offset[col] += melt.speed[col] * (dt / 1000);
      }

      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(gameSnapshot!, 0, 0, w, h);

      for (let col = 0; col < MELT_COLUMNS; col++) {
        const y = Math.min(h, Math.floor(melt.offset[col]));
        if (y >= h) continue;
        const sx = Math.floor(col * columnWidth);
        const sw = Math.max(1, Math.ceil((col + 1) * columnWidth) - sx);
        ctx.drawImage(loading, sx, 0, sw, h - y, sx, y, sw, h - y);
      }

      const melted = melt.offset.every((value) => value >= h);
      if (elapsed >= WIPE_DURATION_MS || melted) {
        onCompleteRef.current();
        rafRef.current = null;
        return;
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return true;
  }, [gameCanvasRef, loadingMessage, paintLoadingScreen]);

  useEffect(() => {
    if (!active || !wad) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (loadingAnimRef.current !== null) {
        window.clearInterval(loadingAnimRef.current);
        loadingAnimRef.current = null;
      }
      if (staticAnimRef.current !== null) {
        window.clearInterval(staticAnimRef.current);
        staticAnimRef.current = null;
      }
      return;
    }

    if (phase === 'loading') {
      paintLoadingScreen(loadingMessage(3), false);
      let dot = 0;
      loadingAnimRef.current = window.setInterval(() => {
        dot = (dot + 1) % 4;
        paintLoadingScreen(loadingMessage(dot), false);
      }, LOADING_ANIM_MS);

      if (staticAnimRef.current !== null) {
        window.clearInterval(staticAnimRef.current);
        staticAnimRef.current = null;
      }
    } else if (phase === 'static') {
      if (loadingAnimRef.current !== null) {
        window.clearInterval(loadingAnimRef.current);
        loadingAnimRef.current = null;
      }
      paintLoadingScreen(loadingMessage(3), true);
      staticAnimRef.current = window.setInterval(() => {
        paintLoadingScreen(loadingMessage(3), true);
      }, STATIC_FLICKER_MS);
    } else if (loadingAnimRef.current !== null) {
      window.clearInterval(loadingAnimRef.current);
      loadingAnimRef.current = null;
    }

    return () => {
      if (loadingAnimRef.current !== null) {
        window.clearInterval(loadingAnimRef.current);
        loadingAnimRef.current = null;
      }
      if (staticAnimRef.current !== null) {
        window.clearInterval(staticAnimRef.current);
        staticAnimRef.current = null;
      }
    };
  }, [active, loadingMessage, paintLoadingScreen, phase, wad]);

  useEffect(() => {
    if (!active || phase !== 'wipe' || !wad) {
      if (phase !== 'wipe' && rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    if (staticAnimRef.current !== null) {
      window.clearInterval(staticAnimRef.current);
      staticAnimRef.current = null;
    }

    let cancelled = false;
    let attempts = 0;

    const tryStartWipe = () => {
      if (cancelled) return;
      if (runWipe()) return;
      if (attempts++ < 120) {
        requestAnimationFrame(tryStartWipe);
      } else {
        onCompleteRef.current();
      }
    };

    const startId = requestAnimationFrame(() => {
      requestAnimationFrame(tryStartWipe);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(startId);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [active, phase, runWipe, wad]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const overlay = overlayRef.current;
    const loading = loadingRef.current;
    if (!active || !viewport || !overlay || !loading) return;

    const resize = () => {
      syncCanvasSize(overlay, loading, viewport.clientWidth, viewport.clientHeight);
      if (phase === 'loading') {
        paintLoadingScreen(loadingMessage(3), false);
      } else if (phase === 'static') {
        paintLoadingScreen(loadingMessage(3), true);
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [active, loadingMessage, paintLoadingScreen, phase, viewportRef]);

  return (
    <div
      className={`doom-level-transition ${active ? 'doom-level-transition--active' : ''}`}
      aria-hidden={!active}
    >
      <canvas ref={loadingRef} className="doom-level-transition__buffer" />
      <canvas ref={overlayRef} className="doom-level-transition__overlay" />
    </div>
  );
};
