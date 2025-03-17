import React, { useEffect, useRef, useState } from 'react';
import { drawMap } from '@/parser/render/drawMap';
import { renderGame } from '@/parser/render/renderGame';
import { loadWadFromBlob } from '@/parser/wad/loadWadFromBlob';
import { Wad } from '@/parser/interfaces/Wad';

/* ------------------------ HELPER FUNCTIONS ------------------------ */

async function fetchWadBuffer(wadPath: string): Promise<ArrayBuffer> {
  const response = await fetch(wadPath);
  return await response.arrayBuffer();
}

function parseWadFromBuffer(buffer: ArrayBuffer): Wad {
  return loadWadFromBlob(buffer);
}

function populateMapSelect(
  mapSelectEl: HTMLSelectElement,
  wadData: Wad,
  onMapChange: (mapName: string) => void
) {
  const mapNames = Object.keys(wadData.maps);
  mapSelectEl.innerHTML = '';
  mapNames.forEach((mapName) => {
    const option = document.createElement('option');
    option.value = mapName;
    option.innerText = mapName;
    mapSelectEl.appendChild(option);
  });
  mapSelectEl.value = mapNames[0];
  onMapChange(mapNames[0]);
}

function loadMap(mapName: string, wadData: Wad) {
  return wadData.maps[mapName];
}

function renderMap(map: any, mapCanvas: HTMLCanvasElement, game: any, wadData: Wad) {
  drawMap(mapCanvas, map);
  game.loadWad(wadData, map);
}

/* ------------------------ COMPONENT ------------------------ */

export const DoomCanvas: React.FC = () => {
  const wadSelectRef = useRef<HTMLSelectElement>(null);
  const mapSelectRef = useRef<HTMLSelectElement>(null);
  const mapCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameCanvasRef = useRef<HTMLCanvasElement>(null);

  const [wad, setWad] = useState<Wad | null>(null);
  const [game, setGame] = useState<any>(null);

  // Init the game
  useEffect(() => {
    if (gameCanvasRef.current && !game) {
      const g = renderGame(gameCanvasRef.current);
      setGame(g);
    }
  }, [game]);

  // Handle WAD selection
  const handleWadChange = async (wadPath: string) => {
    const buffer = await fetchWadBuffer(wadPath);
    const wadData = parseWadFromBuffer(buffer);
    setWad(wadData);

    if (mapSelectRef.current) {
      populateMapSelect(mapSelectRef.current, wadData, (mapName) => {
        if (mapCanvasRef.current && game) {
          const map = loadMap(mapName, wadData);
          renderMap(map, mapCanvasRef.current, game, wadData);
        }
      });
    }
  };

  // Handle map change
  const handleMapChange = (mapName: string) => {
    if (wad && mapCanvasRef.current && game) {
      const map = loadMap(mapName, wad);
      renderMap(map, mapCanvasRef.current, game, wad);
    }
  };

  return (
    <>
      <div style={{ marginBottom: '1rem' }}>
        <label>Select WAD: </label>
        <select
          ref={wadSelectRef}
          onChange={(e) => handleWadChange(e.target.value)}
          defaultValue=""
        >
          <option value="" disabled>
            Select a wad
          </option>
          <option value="/wads/DOOM1.WAD">DOOM1</option>
          <option value="/wads/DOOM2.WAD">DOOM2</option>
        </select>
      </div>

      {wad && (
        <div style={{ marginBottom: '1rem' }}>
          <label>Select Map: </label>
          <select
            ref={mapSelectRef}
            onChange={(e) => handleMapChange(e.target.value)}
          />
        </div>
      )}

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