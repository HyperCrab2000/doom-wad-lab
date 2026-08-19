import React, { useCallback, useEffect, useRef } from 'react';
import type { Wad } from '@/wad/interfaces/Wad';
import type { LevelStatsSnapshot } from '@/wad/game/levelStats';
import { percent } from '@/wad/game/levelStats';
import { drawDoomLoadingScreen, drawStcfnTextCentered } from './doomLoadingScreen';

const COUNT_UP_MS = 1400;
const AUTO_ADVANCE_MS = 6500;

function drawStatLine(
  ctx: CanvasRenderingContext2D,
  wad: Wad,
  label: string,
  found: number,
  total: number,
  displayPercent: number,
  centerX: number,
  y: number,
  scale: number
): void {
  const counts = `${found} / ${total}`;
  const pct = `${displayPercent}%`;
  drawStcfnTextCentered(ctx, wad, label, centerX, y - scale * 6, scale);
  drawStcfnTextCentered(ctx, wad, counts, centerX - scale * 52, y + scale * 10, scale);
  drawStcfnTextCentered(ctx, wad, pct, centerX + scale * 52, y + scale * 10, scale);
}

export const DoomIntermission: React.FC<{
  active: boolean;
  wad: Wad | null;
  mapName: string;
  nextMapName: string | null;
  stats: LevelStatsSnapshot;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  onContinue: () => void;
}> = ({ active, wad, mapName, nextMapName, stats, viewportRef, onContinue }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onContinueRef = useRef(onContinue);
  onContinueRef.current = onContinue;

  const paint = useCallback(
    (progress: number) => {
      const canvas = canvasRef.current;
      const viewport = viewportRef.current;
      if (!canvas || !viewport || !wad) return;

      const w = Math.max(1, viewport.clientWidth);
      const h = Math.max(1, viewport.clientHeight);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      drawDoomLoadingScreen(canvas, wad, 'FINISHED');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const scale = Math.max(2, Math.min(4, Math.floor(Math.min(w, h) / 90)));
      const killsPct = Math.round(percent(stats.found.monsters, stats.totals.monsters) * progress);
      const itemsPct = Math.round(percent(stats.found.items, stats.totals.items) * progress);
      const secretsPct = Math.round(percent(stats.found.secrets, stats.totals.secrets) * progress);

      const killsFound = Math.round(stats.found.monsters * progress);
      const itemsFound = Math.round(stats.found.items * progress);
      const secretsFound = Math.round(stats.found.secrets * progress);

      drawStcfnTextCentered(ctx, wad, mapName, w / 2, h * 0.22, scale + 1);
      drawStatLine(
        ctx,
        wad,
        'KILLS',
        killsFound,
        stats.totals.monsters,
        killsPct,
        w / 2,
        h * 0.42,
        scale
      );
      drawStatLine(
        ctx,
        wad,
        'ITEMS',
        itemsFound,
        stats.totals.items,
        itemsPct,
        w / 2,
        h * 0.56,
        scale
      );
      drawStatLine(
        ctx,
        wad,
        'SECRETS',
        secretsFound,
        stats.totals.secrets,
        secretsPct,
        w / 2,
        h * 0.7,
        scale
      );

      const hint = nextMapName ? `ENTER: ${nextMapName}` : 'ENTER: END';
      drawStcfnTextCentered(ctx, wad, hint, w / 2, h * 0.88, scale);
    },
    [mapName, nextMapName, stats, viewportRef, wad]
  );

  useEffect(() => {
    if (!active || !wad) return;

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      paint(t);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    paint(0);
    frame = requestAnimationFrame(tick);

    const advanceTimer = window.setTimeout(() => onContinueRef.current(), AUTO_ADVANCE_MS);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onContinueRef.current();
      }
    };

    window.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(advanceTimer);
      window.removeEventListener('keydown', onKey);
    };
  }, [active, paint, wad]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!active || !viewport) return;
    const observer = new ResizeObserver(() => paint(1));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [active, paint, viewportRef]);

  return (
    <div
      className={`doom-intermission ${active ? 'doom-intermission--active' : ''}`}
      aria-hidden={!active}
    >
      <canvas ref={canvasRef} className="doom-intermission__canvas" />
    </div>
  );
};
