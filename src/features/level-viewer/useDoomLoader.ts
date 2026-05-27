import { useCallback, useEffect, useMemo, useState } from 'react';
import { Wad } from '@/wad/interfaces/Wad';
import { fetchWad } from '@/wad/loader/fetchWad';
import {
  clearWadCache,
  deleteCachedWad,
  getCachedWad,
  setCachedWad,
} from './wadCache';
import { clearMusicPreloadCache } from './music/musicPreload';
import { getSoundfontEngine } from './music/soundfontEngine';
import { clearMapLoadCache } from '@/wad/renderer/renderGame/mapLoadCache';
import { clearWadAssetsCache } from '@/wad/renderer/drawAssets/wadAssetsCache';
import { clearHeightUrlMissCache } from '@/wad/renderer/renderGame/heightTextures';
import { sortDoomMapNames } from '@/wad/game/levelStats';
import {
  createErrorStatus,
  createLaunchingStatus,
  createMapLoadErrorStatus,
  createMapReadyStatus,
  createOpeningStatus,
  createReadingStatus,
  createReadyStatus,
  initialWadLoadStatus,
} from './wadLoaderStatus';

interface GameRenderer {
  load: (wad: Wad, map: Wad['maps'][string], mapName: string, wadPath?: string | null) => Promise<void>;
}

export const useDoomLoader = ({
  game,
  wadPath: wadPathProp,
}: {
  game: GameRenderer | null;
  wadPath?: string | null;
}) => {
  const [wad, setWad] = useState<Wad | null>(null);
  const [wadPath, setWadPath] = useState<string | null>(wadPathProp ?? null);
  const [selectedMap, setSelectedMap] = useState('');
  const [status, setStatus] = useState(initialWadLoadStatus);
  const [mapLoadState, setMapLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const mapNames = useMemo(() => (wad ? sortDoomMapNames(Object.keys(wad.maps)) : []), [wad]);

  useEffect(() => {
    if (!wadPath || !game) return;

    let cancelled = false;

    (async () => {
      setStatus(createOpeningStatus(wadPath));
      void getSoundfontEngine().catch(() => {});

      try {
        const cached = getCachedWad(wadPath);
        if (cached) {
          if (cancelled) return;
          setWad(cached.wad);
          setSelectedMap(Object.keys(cached.wad.maps)[0] ?? '');
          setStatus(createReadyStatus(cached.wad, true, cached.loadedAt));
          return;
        }

        setStatus((prev) => createReadingStatus(prev));

        const wadData = await fetchWad(wadPath);
        const cachedWad = setCachedWad(wadPath, wadData);
        if (cancelled) return;

        setWad(wadData);
        setSelectedMap(Object.keys(wadData.maps)[0] ?? '');
        setStatus(createReadyStatus(wadData, false, cachedWad.loadedAt));
      } catch (error) {
        if (cancelled) return;
        setWad(null);
        setSelectedMap('');
        setStatus(createErrorStatus(error, wadPath));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wadPath, game]);

  useEffect(() => {
    if (!wad || !game || !selectedMap) {
      setMapLoadState('idle');
      return;
    }
    const map = wad.maps[selectedMap];
    if (!map) return;

    let cancelled = false;
    setMapLoadState('loading');
    setStatus((prev) => createLaunchingStatus(prev, selectedMap));

    void getSoundfontEngine().catch(() => {
      /* Music preload is best-effort; useLevelMusic surfaces errors. */
    });

    game
      .load(wad, map, selectedMap, wadPath)
      .then(() => {
        if (!cancelled) {
          setMapLoadState('ready');
          setStatus((prev) => createMapReadyStatus(prev, selectedMap));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMapLoadState('error');
          setStatus(createMapLoadErrorStatus(error, selectedMap));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [game, selectedMap, wad, wadPath]);

  const refreshWad = useCallback(() => {
    if (!wadPath) return;
    deleteCachedWad(wadPath);
    setWad(null);
    setSelectedMap('');
    setWadPath(null);
    window.setTimeout(() => setWadPath(wadPath), 0);
  }, [wadPath]);

  const clearCache = useCallback(() => {
    clearWadCache();
    clearMapLoadCache();
    clearWadAssetsCache();
    clearHeightUrlMissCache();
    clearMusicPreloadCache();
    if (wadPath) {
      refreshWad();
    }
  }, [refreshWad, wadPath]);

  return {
    wad,
    wadPath,
    mapNames,
    selectedMap,
    status,
    mapLoadState,
    setWadPath,
    setSelectedMap,
    refreshWad,
    clearCache,
  };
};
