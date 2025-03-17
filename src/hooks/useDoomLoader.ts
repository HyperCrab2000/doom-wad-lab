import { useEffect, useState } from 'react';
import { Wad } from '@/parser/interfaces/Wad';
import { fetchWad } from '@/wad/loader/fetchWad';
import { renderMap } from '@/wad/loader/renderMap';
import { populateMapSelect } from '@/wad/loader/populateMapSelect';

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

  useEffect(() => {
    if (wadPath && game) {
      (async () => {
        const wadData = await fetchWad(wadPath);
        setWad(wadData);

        if (mapSelect) {
          populateMapSelect(mapSelect, wadData, (mapName) => {
            if (mapCanvas && game) {
              renderMap(mapName, wadData, mapCanvas, game);
            }
          });
        }
      })();
    }
  }, [wadPath, game]);

  const handleMapChange = (mapName: string) => {
    if (wad && mapCanvas && game) {
      renderMap(mapName, wad, mapCanvas, game);
    }
  };

  return {
    wad,
    setWadPath,
    handleMapChange,
  };
};
