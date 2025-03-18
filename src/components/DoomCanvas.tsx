import React, { useEffect, useRef, useState } from 'react';
import { renderGame } from '@/wad/renderer/renderGame';
import { useDoomLoader } from '@/hooks/useDoomLoader';

export const DoomCanvas: React.FC = () => {
  const wadSelectRef = useRef<HTMLSelectElement>(null);
  const mapSelectRef = useRef<HTMLSelectElement>(null);
  const mapCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameCanvasRef = useRef<HTMLCanvasElement>(null);

  const [game, setGame] = useState<any>(null);

  // Init the game renderer
  useEffect(() => {
    if (gameCanvasRef.current && !game) {
      const g = renderGame(gameCanvasRef.current);
      setGame(g);
    }
  }, [game]);

  // Use custom hook!
  const { setWadPath, handleMapChange } = useDoomLoader({
    game,
    mapCanvas: mapCanvasRef.current,
    mapSelect: mapSelectRef.current,
  });

  return (
    <>
      <div style={{ marginBottom: '1rem' }}>
        <label>Select WAD: </label>
        <select ref={wadSelectRef} onChange={(e) => setWadPath(e.target.value)} defaultValue="">
          <option value="" disabled>
            Select a wad
          </option>
          <option value="/wads/DOOM.WAD">DOOM</option>
          <option value="/wads/DOOM2.WAD">DOOM2</option>
        </select>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label>Select Map: </label>
        <select ref={mapSelectRef} onChange={(e) => handleMapChange(e.target.value)} />
      </div>

      <div style={{ display: 'flex', gap: '1rem' }}>
        <canvas ref={mapCanvasRef} width="400" height="400" style={{ border: '1px solid black' }} />
        <canvas
          ref={gameCanvasRef}
          width="640"
          height="480"
          style={{ border: '1px solid black' }}
        />
      </div>
    </>
  );
};
