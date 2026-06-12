import React, { useCallback, useEffect, useRef } from 'react';
import { drawDoomLoadingScreen } from './doomLoadingScreen';

const WIPE_DURATION_MS = 1500;
const MELT_COLUMNS = 160;
const LOADING_ANIM_MS = 400;

function createMeltState(height: number): { offset: Float32Array; speed: Float32Array } {
  const offset = new Float32Array(MELT_COLUMNS);
  const speed = new Float32Array(MELT_COLUMNS);
  for (let i = 0; i < MELT_COLUMNS; i++) {
    offset[i] = 0;
    // Pixels per second — staggered columns finish near WIPE_DURATION_MS.
    speed[i] = height * (0.55 + Math.random() * 0.65);
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

export type LevelTransitionPhase = 'loading' | 'wipe';

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
  const onCompleteRef = useRef(onComplete);
  const onSnapshotCapturedRef = useRef(onSnapshotCaptured);
  onCompleteRef.current = onComplete;
  onSnapshotCapturedRef.current = onSnapshotCaptured;

  const paintLoadingScreen = useCallback(
    (message = 'LOADING...') => {
      const overlay = overlayRef.current;
      const loading = loadingRef.current;
      if (!overlay || !loading || !wad) return;

      const viewport = viewportRef.current;
      if (viewport) {
        syncCanvasSize(overlay, loading, viewport.clientWidth, viewport.clientHeight);
      }

      drawDoomLoadingScreen(loading, wad, message);
      const ctx = overlay.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(loading, 0, 0, overlay.width, overlay.height);
      }
    },
    [viewportRef, wad]
  );

  const runWipe = useCallback(() => {
    const overlay = overlayRef.current;
    const loading = loadingRef.current;
    const gameCanvas = gameCanvasRef.current;
    if (!overlay || !loading || !gameCanvas || gameCanvas.width < 1 || gameCanvas.height < 1) {
      return false;
    }

    const ctx = overlay.getContext('2d');
    if (!ctx) return false;

    const w = overlay.width;
    const h = overlay.height;
    const melt = createMeltState(h);
    const columnWidth = w / MELT_COLUMNS;
    const start = performance.now();
    let lastFrame = start;

    let gameSnapshot = snapshotRef.current;
    if (!gameSnapshot || gameSnapshot.width !== w || gameSnapshot.height !== h) {
      gameSnapshot = document.createElement('canvas');
      gameSnapshot.width = w;
      gameSnapshot.height = h;
      snapshotRef.current = gameSnapshot;
    }
    const snapshotCtx = gameSnapshot.getContext('2d');
    if (!snapshotCtx) return false;
    snapshotCtx.imageSmoothingEnabled = false;
    snapshotCtx.drawImage(gameCanvas, 0, 0, w, h);
    onSnapshotCapturedRef.current?.();

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
        const y = Math.min(h, melt.offset[col]);
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
  }, [gameCanvasRef]);

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
      return;
    }

    paintLoadingScreen(mapLabel ? `LOADING ${mapLabel}` : 'LOADING...');

    if (phase !== 'loading') {
      if (loadingAnimRef.current !== null) {
        window.clearInterval(loadingAnimRef.current);
        loadingAnimRef.current = null;
      }
      return;
    }

    let dot = 0;
    loadingAnimRef.current = window.setInterval(() => {
      dot = (dot + 1) % 4;
      const base = mapLabel ? `LOADING ${mapLabel}` : 'LOADING';
      paintLoadingScreen(`${base}${'.'.repeat(dot)}`);
    }, LOADING_ANIM_MS);

    return () => {
      if (loadingAnimRef.current !== null) {
        window.clearInterval(loadingAnimRef.current);
        loadingAnimRef.current = null;
      }
    };
  }, [active, mapLabel, paintLoadingScreen, phase, wad]);

  useEffect(() => {
    if (!active || phase !== 'wipe' || !wad) {
      if (phase !== 'wipe' && rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    paintLoadingScreen(mapLabel ? `LOADING ${mapLabel}` : 'LOADING...');

    let cancelled = false;
    let attempts = 0;

    const tryStartWipe = () => {
      if (cancelled) return;
      if (runWipe()) return;
      if (attempts++ < 90) {
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
  }, [active, mapLabel, paintLoadingScreen, phase, runWipe, wad]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const overlay = overlayRef.current;
    const loading = loadingRef.current;
    if (!active || !viewport || !overlay || !loading) return;

    const resize = () => {
      syncCanvasSize(overlay, loading, viewport.clientWidth, viewport.clientHeight);
      if (phase === 'loading') {
        paintLoadingScreen(mapLabel ? `LOADING ${mapLabel}` : 'LOADING...');
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [active, mapLabel, paintLoadingScreen, phase, viewportRef]);

  if (!active) return null;

  return (
    <div className="doom-level-transition" aria-hidden={!active}>
      <canvas ref={loadingRef} className="doom-level-transition__buffer" />
      <canvas ref={overlayRef} className="doom-level-transition__overlay" />
    </div>
  );
};
