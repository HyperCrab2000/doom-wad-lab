import React, { useEffect, useRef, useState } from 'react';
import type { Wad } from '@/wad/interfaces/Wad';
import { drawDoomHeaderLogo } from './doomWadGraphics';

/** M_DOOM patch from the loaded IWAD — the classic in-game logo without "The Ultimate". */
export const DoomHeaderLogo: React.FC<{ wad: Wad | null }> = ({ wad }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasLogo, setHasLogo] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !wad) {
      setHasLogo(false);
      return;
    }

    const height = canvas.clientHeight || 44;
    setHasLogo(drawDoomHeaderLogo(canvas, wad, height));
  }, [wad]);

  return (
    <h1 className="doom-wordmark" aria-label="DOOM">
      {wad ? (
        <canvas
          ref={canvasRef}
          className="doom-wordmark-patch"
          aria-hidden={!hasLogo}
          style={hasLogo ? undefined : { display: 'none' }}
        />
      ) : null}
      {!wad || !hasLogo ? <span className="doom-wordmark-main">DOOM</span> : null}
      <span className="doom-wordmark-sub">JS</span>
    </h1>
  );
};
