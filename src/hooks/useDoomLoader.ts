import { useEffect, useState } from 'react';
import { Wad } from '@/parser/interfaces/Wad';
import { loadWadFromBlob } from '@/parser/wad/loadWadFromBlob';
import { drawMap } from '@/parser/render/drawMap';

// HELPER: fetch + parse the WAD
async function fetchWad(path: string): Promise<Wad> {
  const res = await fetch(path);
  const buffer = await res.arrayBuffer();
  return loadWadFromBlob(buffer);
}

// HELPER: load map from wad object
function loadMap(mapName: string, wad: Wad) {
  return wad.maps[mapName];
}

export const useDoomLoader = ({
  game,
  mapCanvas,
  mapSelect,
}: {
  game: any | null;
  mapCanvas: HTMLCanvasElement | null;
  mapSelect: HTMLSelectElement | null;
}) => {
  const [wad, setWad] = useState<Wad | null>(null);
  const [wadPath, setWadPath] = useState<string | null>(null);

  // Trigger loading when wadPath + game are ready
  useEffect(() => {
    if (wadPath && game) {
      (async () => {
        const wadData = await fetchWad(wadPath);
        setWad(wadData);

        // Populate <select>
        if (mapSelect) {
          const mapNames = Object.keys(wadData.maps);
          mapSelect.innerHTML = '';
          mapNames.forEach((mapName) => {
            const option = document.createElement('option');
            option.value = mapName;
            option.innerText = mapName;
            mapSelect.appendChild(option);
          });

          mapSelect.value = mapNames[0];
          renderMap(mapNames[0], wadData);
        }
      })();
    }
  }, [wadPath, game]);

  // Render selected map
  const renderMap = (mapName: string, wadData: Wad) => {
    if (!mapCanvas || !game) return;
    const map = loadMap(mapName, wadData);
    drawMap(mapCanvas, map);
    game.loadWad(wadData, map);
  };

  // Handle map <select> changes
  const handleMapChange = (mapName: string) => {
    if (wad) {
      renderMap(mapName, wad);
    }
  };

  return {
    wad,
    setWadPath, // call this on <select> WAD change
    handleMapChange, // call this on <select> MAP change
  };
};
