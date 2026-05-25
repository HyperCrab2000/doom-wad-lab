import { useEffect, useRef, type FC } from 'react';
import { getSoundfontEngine } from './soundfontEngine';

const WIDTH = 88;
const HEIGHT = 20;
const BAR_COUNT = 18;

interface MusicVisualizerProps {
  active: boolean;
}

export const MusicVisualizer: FC<MusicVisualizerProps> = ({ active }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    let analyser: AnalyserNode | null = null;
    const freqData = new Uint8Array(128);
    const timeData = new Uint8Array(256);

    void getSoundfontEngine().then((engine) => {
      analyser = engine.getAnalyser();
    });

    const drawIdle = () => {
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.strokeStyle = '#173317';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, HEIGHT / 2);
      ctx.lineTo(WIDTH, HEIGHT / 2);
      ctx.stroke();
    };

    const drawActive = () => {
      if (!analyser) {
        drawIdle();
        return;
      }

      analyser.getByteFrequencyData(freqData);
      analyser.getByteTimeDomainData(timeData);

      ctx.fillStyle = '#030303';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      const spectrumTop = 9;
      const barWidth = WIDTH / BAR_COUNT;

      for (let i = 0; i < BAR_COUNT; i++) {
        const sample = freqData[Math.floor((i * freqData.length) / BAR_COUNT)] / 255;
        const barHeight = Math.max(1, sample * (HEIGHT - spectrumTop - 1));
        const x = i * barWidth + 1;

        const gradient = ctx.createLinearGradient(0, HEIGHT, 0, HEIGHT - barHeight);
        gradient.addColorStop(0, '#cc4400');
        gradient.addColorStop(0.45, '#ffaa00');
        gradient.addColorStop(1, '#ffff55');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, HEIGHT - barHeight, Math.max(1, barWidth - 2), barHeight);
      }

      ctx.strokeStyle = '#33ff33';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < WIDTH; x++) {
        const sample = timeData[Math.floor((x * timeData.length) / WIDTH)];
        const normalized = (sample - 128) / 128;
        const y = spectrumTop / 2 + 1 - normalized * (spectrumTop / 2 - 1);
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    };

    const tick = () => {
      if (active) {
        drawActive();
      } else {
        drawIdle();
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="music-viz"
      width={WIDTH}
      height={HEIGHT}
      aria-hidden
      title={active ? 'Music playing' : 'Music stopped'}
    />
  );
};
