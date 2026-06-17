import { useCallback, useEffect, useMemo, useState } from 'react';
import { Wad } from '@/wad/interfaces/Wad';
import { fetchWad, fetchWadStack, wadStackCacheKey } from '@/wad/loader/fetchWadStack';
import {
  clearWadCache,
  deleteCachedWad,
  getCachedWad,
  setCachedWad,
} from './wadCache';
import { clearMusicPreloadCache } from './music/musicPreload';
import { getSoundfontEngine } from './music/soundfontEngine';
import { clearMapLoadCache } from '@/wad/renderer/renderGame/mapLoadCache';
import { clearRtglResourceCache } from '@/wad/renderer/rtgl/rtglResourceCache';
import { clearRtglBackendCache } from '@/wad/renderer/rtgl/loadRtglBackend';
import { clearTextureAtlasCache } from '@/wad/renderer/rtgl/textureAtlas';
import { clearWadAssetsCache } from '@/wad/renderer/drawAssets/wadAssetsCache';
import { clearHeightUrlMissCache } from '@/wad/renderer/renderGame/heightTextures';
import { clearFederatedWasmBackendCache } from '@/wad/renderer/gzrender-v2/federated/loadFederatedWasmBackend';
import { resetFederatedRuntime } from '@/wad/federated/GzFederatedRuntime';
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
  load: (
    wad: Wad,
    map: Wad['maps'][string],
    mapName: string,
    wadPath?: string | null,
    modPaths?: readonly string[],
  ) => Promise<void>;
}

export const useDoomLoader = ({
  game,
  wadPath: wadPathProp,
  modPaths = [],
}: {
  game: GameRenderer | null;
  wadPath?: string | null;
  /** PWAD patch URLs applied after IWAD (GZDoom `-file` order). */
  modPaths?: readonly string[];
}) => {
  const [wad, setWad] = useState<Wad | null>(null);
  const [wadPath, setWadPath] = useState<string | null>(wadPathProp ?? null);
  const modPathsKey = useMemo(() => modPaths.join('|'), [modPaths]);
  const stackCacheKey = useMemo(
    () => (wadPath ? wadStackCacheKey(wadPath, modPaths) : null),
    [wadPath, modPaths],
  );
  const [selectedMap, setSelectedMap] = useState('');
  const [status, setStatus] = useState(initialWadLoadStatus);
  const [mapLoadState, setMapLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const mapNames = useMemo(() => (wad ? Object.keys(wad.maps) : []), [wad]);

  useEffect(() => {
    if (!wadPath || !game) return;

    let cancelled = false;

    (async () => {
      setStatus(createOpeningStatus(wadPath));
      void getSoundfontEngine().catch(() => {});

      try {
        const cacheKey = stackCacheKey ?? wadPath;
        const cached = getCachedWad(cacheKey);
        if (cached) {
          if (cancelled) return;
          setWad(cached.wad);
          setSelectedMap(Object.keys(cached.wad.maps)[0] ?? '');
          setStatus(createReadyStatus(cached.wad, true, cached.loadedAt));
          return;
        }

        setStatus((prev) => createReadingStatus(prev));

        const wadData =
          modPaths.length > 0
            ? await fetchWadStack(wadPath, [...modPaths])
            : await fetchWad(wadPath);
        const cachedWad = setCachedWad(cacheKey, wadData);
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
  }, [wadPath, game, stackCacheKey, modPathsKey, modPaths]);

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
      .load(wad, map, selectedMap, wadPath, modPaths)
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
  }, [game, selectedMap, wad, wadPath, modPathsKey, modPaths]);

  const refreshWad = useCallback(() => {
    if (!wadPath) return;
    const cacheKey = stackCacheKey ?? wadPath;
    deleteCachedWad(cacheKey);
    setWad(null);
    setSelectedMap('');
    setWadPath(null);
    window.setTimeout(() => setWadPath(wadPath), 0);
  }, [wadPath, stackCacheKey]);

  const clearCache = useCallback(() => {
    clearWadCache();
    clearMapLoadCache();
    clearRtglResourceCache();
    clearRtglBackendCache();
    clearTextureAtlasCache();
    clearWadAssetsCache();
    clearHeightUrlMissCache();
    clearFederatedWasmBackendCache();
    resetFederatedRuntime();
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
