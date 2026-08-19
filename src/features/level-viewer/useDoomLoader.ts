import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
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
import { PLAYABLE_WAD_OPTIONS } from '@/config/doomAssets';
import type { RenderBackend } from '@/wad/renderer/renderBackend';
import { isGzdoomWasmFamily, needsNodeWadLumpParse } from '@/wad/renderer/renderBackend';
import { clearIwadLumpCache, listMapNamesFromIwad } from '@/wad/loader/iwadLumpAccess';
import {
  captureGzdoomViewerFrame,
  disposeGzdoomViewerRuntime,
  getHostedGzdoomModule,
  startGzdoomHostedPlay,
  stopGzdoomHostedPlay,
} from '@/wad/renderer/gzrender-v2/gzdoom/gzdoomViewerRuntime';
import {
  disposeGzdoomSRuntime,
  getGzdoomSModule,
  GzdoomSSessionSupersededError,
  startGzdoomSPlay,
  stopGzdoomSPlay,
} from '@/wad/renderer/gzrender-v2/gzdoom/gzdoomSViewerRuntime';
import {
  CLASSIC_MAP_LOAD_TIMEOUT_MS,
  GZDOOM_WASM_MAP_LOAD_TIMEOUT_MS,
} from './mapLoadTimeout';
import { withTimeout } from '@/utils/promiseTimeout';
import {
  INITIAL_GZDOOM_LOAD_PROGRESS,
  type GzdoomLoadProgress,
} from '@/features/level-viewer/gzdoomPlayLoadProgress';
import type { RenderLayerToggles } from '@/wad/renderer/modular/renderLayerToggles';

function resolveSelectedMapFromWad(wadMaps: Wad['maps']): string {
  const names = Object.keys(wadMaps);
  if (typeof window !== 'undefined') {
    const fromUrl = new URLSearchParams(window.location.search).get('map');
    if (fromUrl && wadMaps[fromUrl]) return fromUrl;
  }
  return names[0] ?? '';
}
import {
  createErrorStatus,
  createGzdoomLaunchingStatus,
  createGzdoomMapReadyStatus,
  createGzdoomPlayReadyStatus,
  createGzdoomSPlayInjectStatus,
  createGzdoomSPlayReadyStatus,
  createGzdoomWasmIndexStatus,
  createLaunchingStatus,
  createMapLoadErrorStatus,
  createMapReadyStatus,
  createOpeningStatus,
  createReadingStatus,
  createReadyStatus,
  initialWadLoadStatus,
  tickLumpParseProgress,
} from './wadLoaderStatus';

interface GameRenderer {
  load: (
    wad: Wad,
    map: Wad['maps'][string],
    mapName: string,
    wadPath?: string | null,
    modPaths?: readonly string[],
  ) => Promise<void>;
  setRenderBackend?: (backend: RenderBackend) => void;
}

export const useDoomLoader = ({
  game,
  wadPath: wadPathProp,
  modPaths = [],
  renderBackend,
  gzdoomCanvasRef,
  gzdoomPlayCanvasLive = false,
  loadGzdoomPlay = false,
  captureGzdoomGold = true,
  renderLayerToggles,
}: {
  game: GameRenderer | null;
  wadPath?: string | null;
  modPaths?: readonly string[];
  renderBackend: RenderBackend;
  gzdoomCanvasRef?: RefObject<HTMLCanvasElement | null>;
  /** True once the play canvas element is mounted (stable key — no remount on map change). */
  gzdoomPlayCanvasLive?: boolean;
  /** GZDoom WASM hosted renderer for Play tab (NOT Classic TS). */
  loadGzdoomPlay?: boolean;
  /** Spawn-frame WASM gold capture (Phase 2c); parallel with Classic play, not on its critical path. */
  captureGzdoomGold?: boolean;
  /** Layers panel toggles — GZDoom WASM/(s) restart play with +cvar argv when these change. */
  renderLayerToggles: RenderLayerToggles;
}) => {
  const useGzdoomWasm = renderBackend === 'gzdoom-wasm';
  const useGzdoomSWasm = renderBackend === 'gzdoom-s-wasm';
  const loaderReady = isGzdoomWasmFamily(renderBackend) || game != null;

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
  const [classicPlayState, setClassicPlayState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [gzdoomFrameUrl, setGzdoomFrameUrl] = useState<string | null>(null);
  const [gzdoomWasmError, setGzdoomWasmError] = useState<string | null>(null);
  const gzdoomFrameUrlRef = useRef<string | null>(null);
  const mapLoadGenRef = useRef(0);
  const classicLoadGenRef = useRef(0);
  const [gzdoomMapNames, setGzdoomMapNames] = useState<string[]>([]);
  // Backend that last parsed the WAD lumps. Switching INTO a Node-parse backend (Classic / GZDoom
  // (s)) from a different one forces a fresh reload rather than reusing another backend's cache.
  const lastWadParseBackendRef = useRef<RenderBackend | null>(null);
  const classicReadyKeyRef = useRef('');
  const prevRenderBackendRef = useRef(renderBackend);
  const [classicLoadStartedAt, setClassicLoadStartedAt] = useState<number | null>(null);
  const [goldCaptureStartedAt, setGoldCaptureStartedAt] = useState<number | null>(null);
  const [gzdoomLoadProgress, setGzdoomLoadProgress] = useState<GzdoomLoadProgress>(
    INITIAL_GZDOOM_LOAD_PROGRESS,
  );
  const [gzdoomGoldLoadProgress, setGzdoomGoldLoadProgress] = useState<GzdoomLoadProgress>(
    INITIAL_GZDOOM_LOAD_PROGRESS,
  );

  const reportGzdoomLoadProgress = useCallback((progress: GzdoomLoadProgress) => {
    setGzdoomLoadProgress(progress);
  }, []);

  const reportGzdoomGoldLoadProgress = useCallback((progress: GzdoomLoadProgress) => {
    setGzdoomGoldLoadProgress(progress);
  }, []);

  const renderLayerTogglesRef = useRef(renderLayerToggles);
  renderLayerTogglesRef.current = renderLayerToggles;

  // On renderer switch (not initial mount): tear down hosted GZDoom and reset play state so the new
  // backend never inherits a stale session key or zombie WASM main loop on the shared canvas path.
  useEffect(() => {
    if (prevRenderBackendRef.current === renderBackend) return;
    prevRenderBackendRef.current = renderBackend;
    classicLoadGenRef.current += 1;
    mapLoadGenRef.current += 1;
    disposeGzdoomViewerRuntime();
    disposeGzdoomSRuntime();
    classicReadyKeyRef.current = '';
    setClassicPlayState('idle');
    setMapLoadState('idle');
    setGzdoomLoadProgress(INITIAL_GZDOOM_LOAD_PROGRESS);
    // Classic / GZDoom (s) parse lumps in Node — surface progress immediately on engine select.
    if (needsNodeWadLumpParse(renderBackend) && wadPath) {
      setStatus(createOpeningStatus(wadPath));
    }
  }, [renderBackend, wadPath]);

  const mapNames = useMemo(() => {
    if (renderBackend === 'gzdoom-wasm') return gzdoomMapNames;
    return wad ? Object.keys(wad.maps) : [];
  }, [renderBackend, gzdoomMapNames, wad]);

  useEffect(() => {
    if (!wadPath || !loaderReady) return;

    let cancelled = false;

    (async () => {
      void getSoundfontEngine().catch(() => {});

      // GZDoom WASM (play): GZDoom parses all lumps from the raw IWAD it mounts — the JS side must
      // NOT parse the WAD. We only read map names from the directory (Range request, no full
      // download), so there are no "Opening WAD / Reading bytes" parse bars here; only Classic and
      // GZDoom (s) (needsNodeWadLumpParse) show those, since those backends do parse lumps in Node.
      if (renderBackend === 'gzdoom-wasm') {
        try {
          const names = await listMapNamesFromIwad(wadPath);
          if (cancelled) return;
          setWad(null);
          setGzdoomMapNames(names);
          setSelectedMap(names[0] ?? '');
          setStatus(createGzdoomWasmIndexStatus(wadPath, names.length));
          // Play does not parse lumps; mark so a later switch to Classic/(s) forces a reload.
          lastWadParseBackendRef.current = renderBackend;
        } catch (error) {
          if (cancelled) return;
          setWad(null);
          setGzdoomMapNames([]);
          setSelectedMap('');
          setStatus(createErrorStatus(error, wadPath));
        }
        return;
      }

      if (!needsNodeWadLumpParse(renderBackend)) return;

      // Classic / GZDoom (s): Node parses the WAD lumps here — show the parse progress bars.
      setStatus(createOpeningStatus(wadPath));

      try {
        const cacheKey = stackCacheKey ?? wadPath;
        // Reload lumps when entering this backend from a different one (e.g. Classic GL → GZDoom
        // (s)); only reuse the in-memory cache for same-backend reloads (map switches, remounts).
        const backendChanged = lastWadParseBackendRef.current !== renderBackend;
        const cached = backendChanged ? null : getCachedWad(cacheKey);
        if (cached) {
          // Same-backend reload: still animate lump parse so Classic visibly runs doom-wad-core.
          setStatus(createOpeningStatus(wadPath));
          await new Promise((r) => setTimeout(r, 120));
          if (cancelled) return;
          setStatus((prev) => createReadingStatus(prev));
          await new Promise((r) => setTimeout(r, 280));
          if (cancelled) return;
          setStatus((prev) => tickLumpParseProgress(prev, 0.62));
          await new Promise((r) => setTimeout(r, 220));
          if (cancelled) return;
          setWad(cached.wad);
          setSelectedMap(resolveSelectedMapFromWad(cached.wad.maps));
          setStatus(createReadyStatus(cached.wad, true, cached.loadedAt));
          lastWadParseBackendRef.current = renderBackend;
          return;
        }

        if (backendChanged) {
          console.log(
            `[useDoomLoader] ${renderBackend} selected — reloading WAD lumps from ${wadPath}`,
          );
        }
        setStatus((prev) => createReadingStatus(prev));

        let parseProgress = 0.2;
        const parseTimer = window.setInterval(() => {
          parseProgress = Math.min(0.92, parseProgress + 0.08);
          setStatus((prev) => tickLumpParseProgress(prev, parseProgress));
        }, 140);

        let wadData: Awaited<ReturnType<typeof fetchWad>>;
        try {
          wadData =
            modPaths.length > 0
              ? await fetchWadStack(wadPath, [...modPaths])
              : await fetchWad(wadPath);
        } finally {
          window.clearInterval(parseTimer);
        }
        const cachedWad = setCachedWad(cacheKey, wadData);
        if (cancelled) return;

        setWad(wadData);
        setSelectedMap(resolveSelectedMapFromWad(wadData.maps));
        setStatus(createReadyStatus(wadData, false, cachedWad.loadedAt));
        lastWadParseBackendRef.current = renderBackend;
      } catch (error) {
        if (cancelled) return;
        const fallback = PLAYABLE_WAD_OPTIONS[0]?.path ?? '/wads/DOOM.WAD';
        const message = error instanceof Error ? error.message : String(error);
        const shouldRetry =
          wadPath !== fallback &&
          (message.includes('too small') ||
            message.includes('Invalid WAD') ||
            message.includes('HTML instead') ||
            message.includes('worker') ||
            message.includes('Failed to fetch'));
        if (shouldRetry) {
          deleteCachedWad(stackCacheKey ?? wadPath);
          setWad(null);
          setSelectedMap('');
          setWadPath(fallback);
          return;
        }
        setWad(null);
        setSelectedMap('');
        setStatus(createErrorStatus(error, wadPath));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wadPath, loaderReady, stackCacheKey, modPathsKey, modPaths, renderBackend]);

  // GZDoom WASM gold capture (Phase 2c). Must NOT run while Play is active — two concurrent
  // createGzdoomModule() instances corrupt WebGL and produce the tiny-corner / black viewport.
  useEffect(() => {
    if (!useGzdoomWasm || !captureGzdoomGold) {
      if (!isGzdoomWasmFamily(renderBackend)) setMapLoadState('idle');
      return;
    }
    if (!selectedMap || !wadPath) {
      setMapLoadState('idle');
      return;
    }

    const loadGen = ++mapLoadGenRef.current;
    setMapLoadState('loading');
    setGoldCaptureStartedAt(Date.now());
    setGzdoomGoldLoadProgress(INITIAL_GZDOOM_LOAD_PROGRESS);
    setGzdoomWasmError(null);
    setStatus((prev) => createGzdoomLaunchingStatus(prev, selectedMap));

    if (gzdoomFrameUrlRef.current) {
      URL.revokeObjectURL(gzdoomFrameUrlRef.current);
      gzdoomFrameUrlRef.current = null;
    }
    setGzdoomFrameUrl(null);
    // Do not touch classicPlayState — Play mode loads Classic WebGL in parallel.

    void withTimeout(
      captureGzdoomViewerFrame(null, wadPath, selectedMap, reportGzdoomGoldLoadProgress),
      GZDOOM_WASM_MAP_LOAD_TIMEOUT_MS,
      `GZDoom WASM load for ${selectedMap}`,
    )
      .then((frame) => {
        if (mapLoadGenRef.current !== loadGen) {
          URL.revokeObjectURL(frame.objectUrl);
          return;
        }
        gzdoomFrameUrlRef.current = frame.objectUrl;
        setGzdoomFrameUrl(frame.objectUrl);
        setMapLoadState('ready');
        setGoldCaptureStartedAt(null);
        setStatus((prev) => createGzdoomMapReadyStatus(prev, selectedMap));
      })
      .catch((error) => {
        if (mapLoadGenRef.current !== loadGen) return;
        const message = error instanceof Error ? error.message : String(error);
        setGzdoomWasmError(message);
        setMapLoadState('error');
        setGoldCaptureStartedAt(null);
        setStatus(createMapLoadErrorStatus(error, selectedMap));
      });

    return () => {
      mapLoadGenRef.current += 1;
      stopGzdoomHostedPlay();
    };
  }, [useGzdoomWasm, captureGzdoomGold, selectedMap, wadPath, reportGzdoomGoldLoadProgress]);

  // Tear down hosted play when leaving the Play tab or switching away from gzdoom-wasm.
  useEffect(() => {
    if (!useGzdoomWasm) return;
    if (loadGzdoomPlay) return;
    stopGzdoomHostedPlay();
    classicReadyKeyRef.current = '';
    setClassicPlayState('idle');
  }, [useGzdoomWasm, loadGzdoomPlay]);

  // GZDoom WASM hosted Play — GZDoom's renderer on canvas, NOT Classic TS.
  useEffect(() => {
    if (!useGzdoomWasm || !loadGzdoomPlay) {
      return;
    }
    const canvas = gzdoomCanvasRef?.current;
    if (!selectedMap || !wadPath || !canvas) {
      return;
    }

    const loadKey = `${wadPath}::${selectedMap}`;
    if (classicReadyKeyRef.current === loadKey) {
      const mod = getHostedGzdoomModule();
      if (mod?._gzr_is_ready?.() === 1) {
        setClassicPlayState('ready');
        return;
      }
      classicReadyKeyRef.current = '';
    }

    const loadGen = ++classicLoadGenRef.current;
    setClassicLoadStartedAt(Date.now());
    setClassicPlayState('loading');
    setGzdoomLoadProgress(INITIAL_GZDOOM_LOAD_PROGRESS);

    let cancelled = false;
    let started = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      started = true;
      void withTimeout(
        startGzdoomHostedPlay(
          canvas,
          wadPath,
          selectedMap,
          renderLayerTogglesRef.current,
          reportGzdoomLoadProgress,
        ),
        GZDOOM_WASM_MAP_LOAD_TIMEOUT_MS,
        `GZDoom hosted play for ${selectedMap}`,
      )
        .then(({ lumpCount: _lumpCount }) => {
          if (cancelled || classicLoadGenRef.current !== loadGen) return;
          classicReadyKeyRef.current = loadKey;
          setClassicPlayState('ready');
          setClassicLoadStartedAt(null);
          setStatus((prev) => createGzdoomPlayReadyStatus(prev, selectedMap));
        })
        .catch((error) => {
          if (cancelled || classicLoadGenRef.current !== loadGen) return;
          setClassicPlayState('error');
          setClassicLoadStartedAt(null);
          classicReadyKeyRef.current = '';
          setGzdoomWasmError(error instanceof Error ? error.message : String(error));
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (started) {
        stopGzdoomHostedPlay();
        classicReadyKeyRef.current = '';
      }
    };
  }, [useGzdoomWasm, loadGzdoomPlay, selectedMap, wadPath, gzdoomPlayCanvasLive, reportGzdoomLoadProgress]);

  // GZDoom (s) WASM Play — Node GZSTATE + stripped fork binary. NOTE: this effect must NOT depend
  // on `wad`. The (s) runtime (startGzdoomSPlay) fetches and parses the IWAD itself from wadPath
  // (NODE_LUMPS.WAD + GZSTATE), so it does not need the React-parsed `wad`. Depending on `wad` made
  // a backend switch (which reloads `wad`) tear down and re-create a SECOND (s) WASM module on the
  // same canvas mid-load; that zombie module shared the WebGL context and broke the viewport
  // (tiny corner render). Gating on wadPath + selectedMap matches the normal-play effect.
  useEffect(() => {
    if (!useGzdoomSWasm) return;
    const canvas = gzdoomCanvasRef?.current;
    if (!selectedMap || !wadPath || !canvas) {
      setClassicPlayState('idle');
      return;
    }

    const loadKey = `${wadPath}::${selectedMap}::s`;
    if (classicReadyKeyRef.current === loadKey) {
      const mod = getGzdoomSModule();
      if (mod?._gzr_is_ready?.() === 1) {
        setClassicPlayState('ready');
        return;
      }
      classicReadyKeyRef.current = '';
    }

    const loadGen = ++classicLoadGenRef.current;
    setClassicLoadStartedAt(Date.now());
    setClassicPlayState('loading');
    setGzdoomLoadProgress(INITIAL_GZDOOM_LOAD_PROGRESS);
    setStatus((prev) => createGzdoomSPlayInjectStatus(prev, selectedMap, 0));

    let cancelled = false;
    let started = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      started = true;
      void withTimeout(
        startGzdoomSPlay(
          canvas,
          wadPath,
          selectedMap,
          renderLayerTogglesRef.current,
          reportGzdoomLoadProgress,
        ),
        GZDOOM_WASM_MAP_LOAD_TIMEOUT_MS,
        `GZDoom (s) play for ${selectedMap}`,
      )
        .then(({ lumpCount, gzstateBytes }) => {
          if (cancelled || classicLoadGenRef.current !== loadGen) return;
          classicReadyKeyRef.current = loadKey;
          setClassicPlayState('ready');
          setClassicLoadStartedAt(null);
          setStatus((prev) => createGzdoomSPlayReadyStatus(prev, selectedMap, lumpCount, gzstateBytes));
        })
        .catch((error) => {
          if (cancelled || classicLoadGenRef.current !== loadGen) return;
          if (error instanceof GzdoomSSessionSupersededError) return;
          setClassicPlayState('error');
          setClassicLoadStartedAt(null);
          classicReadyKeyRef.current = '';
          setGzdoomWasmError(error instanceof Error ? error.message : String(error));
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (started) {
        stopGzdoomSPlay();
        classicReadyKeyRef.current = '';
      }
    };
  }, [useGzdoomSWasm, selectedMap, wadPath, gzdoomPlayCanvasLive, reportGzdoomLoadProgress]);

  // Classic WebGL — legacy backends only (never GZDoom WASM Play).
  useEffect(() => {
    const wantClassic = !isGzdoomWasmFamily(renderBackend);
    if (!wantClassic) {
      // Stay on 'ready' when switching Gold ↔ Play so Play tab does not reload forever.
      return;
    }
    if (!wad || !selectedMap || !wadPath) {
      setClassicPlayState('idle');
      return;
    }
    if (!game) {
      setClassicPlayState('idle');
      return;
    }

    const map = wad.maps[selectedMap];
    if (!map) return;

    const loadKey = `${wadPath}::${selectedMap}::${modPathsKey}`;
    if (classicReadyKeyRef.current === loadKey) {
      setClassicPlayState('ready');
      if (!isGzdoomWasmFamily(renderBackend)) {
        setMapLoadState('ready');
      }
      return;
    }

    const loadGen = ++classicLoadGenRef.current;
    setClassicLoadStartedAt(Date.now());
    setClassicPlayState('loading');
    if (!isGzdoomWasmFamily(renderBackend)) {
      setMapLoadState('loading');
      setStatus((prev) => createLaunchingStatus(prev, selectedMap));
    }

    void getSoundfontEngine().catch(() => {});

    const loadMap = (retried: boolean) =>
      withTimeout(
        game.load(wad, map, selectedMap, wadPath, modPaths),
        CLASSIC_MAP_LOAD_TIMEOUT_MS,
        `Classic map load for ${selectedMap}`,
      )
        .then(() => {
          if (cancelled || classicLoadGenRef.current !== loadGen) return;
          classicReadyKeyRef.current = loadKey;
          setClassicPlayState('ready');
          setClassicLoadStartedAt(null);
          if (!isGzdoomWasmFamily(renderBackend)) {
            setMapLoadState('ready');
            setStatus((prev) => createMapReadyStatus(prev, selectedMap));
          }
        })
        .catch((error) => {
          if (cancelled || classicLoadGenRef.current !== loadGen) return;
          if (!retried) {
            console.warn(
              `[useDoomLoader] ${selectedMap} classic load failed; retrying:`,
              error,
            );
            clearMapLoadCache();
            clearFederatedWasmBackendCache();
            resetFederatedRuntime();
            game.setRenderBackend?.('classic');
            return loadMap(true);
          }
          setClassicPlayState('error');
          setClassicLoadStartedAt(null);
          classicReadyKeyRef.current = '';
          if (!isGzdoomWasmFamily(renderBackend)) {
            setMapLoadState('error');
            setStatus(createMapLoadErrorStatus(error, selectedMap));
          }
        });

    let cancelled = false;
    void loadMap(false);

    return () => {
      cancelled = true;
    };
  }, [
    renderBackend,
    game,
    selectedMap,
    wad,
    wadPath,
    modPathsKey,
  ]);

  useEffect(() => {
    return () => {
      if (gzdoomFrameUrlRef.current) {
        URL.revokeObjectURL(gzdoomFrameUrlRef.current);
        gzdoomFrameUrlRef.current = null;
      }
      disposeGzdoomViewerRuntime();
      disposeGzdoomSRuntime();
    };
  }, []);

  const refreshWad = useCallback(() => {
    if (!wadPath) return;
    stopGzdoomHostedPlay();
    stopGzdoomSPlay();
    classicReadyKeyRef.current = '';
    setClassicPlayState('idle');
    setGzdoomLoadProgress(INITIAL_GZDOOM_LOAD_PROGRESS);
    const cacheKey = stackCacheKey ?? wadPath;
    deleteCachedWad(cacheKey);
    clearIwadLumpCache(wadPath);
    setWad(null);
    setGzdoomMapNames([]);
    setSelectedMap('');
    setWadPath(null);
    window.setTimeout(() => setWadPath(wadPath), 0);
  }, [wadPath, stackCacheKey]);

  const clearCache = useCallback(() => {
    clearWadCache();
    clearIwadLumpCache();
    clearMapLoadCache();
    clearRtglResourceCache();
    clearRtglBackendCache();
    clearTextureAtlasCache();
    clearWadAssetsCache();
    clearHeightUrlMissCache();
    clearFederatedWasmBackendCache();
    resetFederatedRuntime();
    clearMusicPreloadCache();
    disposeGzdoomViewerRuntime();
    disposeGzdoomSRuntime();
    if (gzdoomFrameUrlRef.current) {
      URL.revokeObjectURL(gzdoomFrameUrlRef.current);
      gzdoomFrameUrlRef.current = null;
    }
    setGzdoomFrameUrl(null);
    setGzdoomWasmError(null);
    setGzdoomMapNames([]);
    classicReadyKeyRef.current = '';
    setClassicPlayState('idle');
    setClassicLoadStartedAt(null);
    setGzdoomLoadProgress(INITIAL_GZDOOM_LOAD_PROGRESS);
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
    classicPlayState,
    classicLoadStartedAt,
    goldCaptureStartedAt,
    gzdoomLoadProgress,
    gzdoomGoldLoadProgress,
    gzdoomFrameUrl,
    gzdoomWasmError,
    setWadPath,
    setSelectedMap,
    refreshWad,
    clearCache,
  };
};
