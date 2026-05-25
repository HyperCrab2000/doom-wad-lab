import React, { useCallback, useEffect, useRef } from 'react';
import { drawDoomLoadingScreen } from './doomLoadingScreen';

const WIPE_DURATION_MS = 1400;
const MELT_COLUMNS = 160;

function createMeltState(height: number): { offset: Float32Array; speed: Float32Array } {
  const offset = new Float32Array(MELT_COLUMNS);
  const speed = new Float32Array(MELT_COLUMNS);
  for (let i = 0; i < MELT_COLUMNS; i++) {
    // Pixels per second — tuned so the full screen melts in ~1.4s.
    speed[i] = 280 + Math.random() * 220;
    offset[i] = -Math.random() * height * 0.15;
  }
  return { offset, speed };
}

export const DoomLevelTransition: React.FC<{
  active: boolean;
  mode: 'static' | 'wipe';
  wad: import('@/wad/interfaces/Wad').Wad | null;
  gameCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  onComplete: () => void;
}> = ({ active, mode, wad, gameCanvasRef, onComplete }) => {
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const loadingRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const runWipe = useCallback(() => {
    const overlay = overlayRef.current;
    const loading = loadingRef.current;
    const gameCanvas = gameCanvasRef.current;
    if (!overlay || !loading || !gameCanvas) return false;

    const ctx = overlay.getContext('2d');
    if (!ctx) return false;

    const w = overlay.width;
    const h = overlay.height;
    const melt = createMeltState(h);
    const columnWidth = w / MELT_COLUMNS;
    const start = performance.now();
    let lastFrame = start;

    const frame = (now: number) => {
      const dt = Math.min(48, now - lastFrame);
      lastFrame = now;
      const t = Math.min(1, (now - start) / WIPE_DURATION_MS);

      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(gameCanvas, 0, 0, w, h);

      for (let col = 0; col < MELT_COLUMNS; col++) {
        melt.offset[col] += melt.speed[col] * (dt / 1000);
      }

      ctx.imageSmoothingEnabled = false;
      for (let col = 0; col < MELT_COLUMNS; col++) {
        const meltPx = Math.min(h, Math.floor(melt.offset[col]));
        if (meltPx <= 0) continue;
        const sx = Math.floor(col * columnWidth);
        const sw = Math.ceil((col + 1) * columnWidth) - sx;
        ctx.drawImage(loading, sx, 0, sw, h - meltPx, sx, meltPx, sw, h - meltPx);
      }

      const melted = melt.offset.every((value) => value >= h);
      if (t >= 1 || melted) {
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
      return;
    }

    const overlay = overlayRef.current;
    const loading = loadingRef.current;
    if (!overlay || !loading) return;

    drawDoomLoadingScreen(loading, wad);
    const ctx = overlay.getContext('2d');
    if (ctx) {
      ctx.drawImage(loading, 0, 0);
    }

    if (mode === 'static') {
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const tryStartWipe = () => {
      if (cancelled) return;
      if (runWipe()) return;
      if (attempts++ < 30) {
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
  }, [active, mode, wad, runWipe]);

  if (!active) return null;

  return (
    <div className="doom-level-transition" aria-hidden={!active}>
      <canvas ref={loadingRef} className="doom-level-transition__buffer" width={960} height={600} />
      <canvas ref={overlayRef} className="doom-level-transition__overlay" width={960} height={600} />
    </div>
  );
};
