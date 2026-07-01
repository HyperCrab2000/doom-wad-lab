import { useEffect, useRef, type FC } from 'react';

const SAMPLES = 64;
const CHART_W = 84;
const CHART_H = 26;
/** Frame-time ceiling for the sparkline scale (ms). 33.3ms == 30fps sits near the top. */
const MS_CEILING = 40;

interface PerfMeterProps {
  /** Only sample/draw while the live GZDoom canvas is presenting. */
  active: boolean;
}

function barColor(ms: number): string {
  if (ms <= 16.7) return '#33ff5a'; // >=60fps
  if (ms <= 33.3) return '#ffd23f'; // >=30fps
  return '#ff4d4d';
}

/**
 * Live frame-time meter for the GZDoom WASM play canvas. GZDoom's Emscripten main loop is driven by
 * requestAnimationFrame, so the rAF interval we sample here is the real on-screen frame cadence.
 * Shows numeric fps + ms plus a rolling sparkline (replaces GZDoom's plain in-canvas vid_fps text).
 */
export const PerfMeter: FC<PerfMeterProps> = ({ active }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fpsRef = useRef<HTMLSpanElement>(null);
  const msRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d') ?? null;
    const history = new Array<number>(SAMPLES).fill(0);

    let raf = 0;
    let last = performance.now();
    let accMs = 0;
    let accFrames = 0;

    const draw = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, CHART_W, CHART_H);
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, CHART_W, CHART_H);

      // 60fps reference line.
      const refY = CHART_H - (16.7 / MS_CEILING) * CHART_H;
      ctx.strokeStyle = 'rgba(51,255,90,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, refY);
      ctx.lineTo(CHART_W, refY);
      ctx.stroke();

      const barW = CHART_W / SAMPLES;
      for (let i = 0; i < SAMPLES; i++) {
        const ms = history[i]!;
        if (ms <= 0) continue;
        const h = Math.min(1, ms / MS_CEILING) * CHART_H;
        ctx.fillStyle = barColor(ms);
        ctx.fillRect(i * barW, CHART_H - h, Math.max(1, barW - 0.5), h);
      }
    };

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      history.push(dt);
      history.shift();
      accMs += dt;
      accFrames += 1;

      // Throttle the text update to ~4Hz so it's readable; chart updates every frame.
      if (accMs >= 250) {
        const avgMs = accMs / accFrames;
        if (msRef.current) msRef.current.textContent = avgMs.toFixed(1);
        if (fpsRef.current) fpsRef.current.textContent = String(Math.round(1000 / avgMs));
        accMs = 0;
        accFrames = 0;
      }
      draw();
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  if (!active) return null;

  return (
    <div className="perf-meter" aria-hidden>
      <div className="perf-meter__readout">
        <span ref={fpsRef} className="perf-meter__value">
          –
        </span>
        <span className="perf-meter__unit">fps</span>
        <span className="perf-meter__sep">·</span>
        <span ref={msRef} className="perf-meter__value perf-meter__value--ms">
          –
        </span>
        <span className="perf-meter__unit">ms</span>
      </div>
      <canvas ref={canvasRef} className="perf-meter__chart" width={CHART_W} height={CHART_H} />
    </div>
  );
};
