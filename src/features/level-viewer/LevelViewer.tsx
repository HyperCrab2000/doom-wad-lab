import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Wad } from '@/wad/interfaces/Wad';
import { PLAYABLE_WAD_OPTIONS } from '@/config/doomAssets';
import { renderGame } from '@/wad/renderer/renderGame/renderGame';
import { useDoomLoader } from './useDoomLoader';
import { useLevelMusic } from './music/useLevelMusic';
import { useLevelSfx } from './sfx/useLevelSfx';
import { MusicVisualizer } from './music/MusicVisualizer';
import { MuteIcon } from './MuteIcon';
import { PerfMeter } from './PerfMeter';
import { DoomLevelTransition } from './DoomLevelTransition';
import {
  AutomapCheatLevel,
  cycleAutomapCheat,
  drawAutomap,
} from '@/wad/renderer/automap/automap';
import { drawBspDebugView } from '@/wad/renderer/bsp/bspDebugView';
import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { readFrameParityModeFromLocation } from '@/wad/parity/frame/frameParity';
import { appendCheatChar, cheatTriggered } from '@/wad/game/doomCheats';
import { ViewportLabelGrid } from './ViewportLabelGrid';
import {
  backendForMapLoad,
  isGzdoomWasmFamily,
  persistRenderBackend,
  readDefaultRenderBackend,
  type RenderBackend,
} from '@/wad/renderer/renderBackend';
import { getHostedGzdoomModule } from '@/wad/renderer/gzrender-v2/gzdoom/gzdoomViewerRuntime';
import { getGzdoomSModule } from '@/wad/renderer/gzrender-v2/gzdoom/gzdoomSViewerRuntime';
import {
  readStoredRenderLayerToggles,
  type RenderLayerToggles,
} from '@/wad/renderer/modular/renderLayerToggles';
import { applyGzdoomLayerTogglesLive } from '@/wad/renderer/gzrender-v2/gzdoom/applyGzdoomLayerTogglesLive';
import { applyClassicLayerTogglesLive } from '@/wad/renderer/modular/applyClassicRenderLayers';
import { classicLayerTestPreset } from '@/wad/renderer/modular/classicLayerMapping';
import { persistRenderLayerToggles } from '@/wad/renderer/modular/renderLayerToggles';
import {
  parseModularRenderStage,
  type ModularRenderStage,
} from '@/wad/renderer/modular/modularRenderStage';
import { RenderLayerPanel, summarizeLayerToggles } from './RenderLayerPanel';
import { GzdoomPlayLoadingOverlay } from './GzdoomPlayLoadingOverlay';
import type { GzdoomWasmModule } from '@/gzdoom-oracle/gzdoomWasmHost';

interface GameRenderer {
  load: ReturnType<typeof renderGame>['load'];
  setPresentationVisible: ReturnType<typeof renderGame>['setPresentationVisible'];
  setAutomapActive: ReturnType<typeof renderGame>['setAutomapActive'];
  setBspDebugActive: ReturnType<typeof renderGame>['setBspDebugActive'];
  setRenderBackend: ReturnType<typeof renderGame>['setRenderBackend'];
  setRenderLayerToggles: ReturnType<typeof renderGame>['setRenderLayerToggles'];
  getPlayerState: ReturnType<typeof renderGame>['getPlayerState'];
  getBspTraceYaw: ReturnType<typeof renderGame>['getBspTraceYaw'];
  waitForRenderedFrame: ReturnType<typeof renderGame>['waitForRenderedFrame'];
  getPathTraceDebugInfo: ReturnType<typeof renderGame>['getPathTraceDebugInfo'];
  getFederatedWasmDebugInfo: ReturnType<typeof renderGame>['getFederatedWasmDebugInfo'];
}

type TransitionPhase = 'loading' | 'wiping' | 'playing';

const MIN_LOADING_SCREEN_MS = 450;

function activeGzdoomWasmModule(backend: RenderBackend): GzdoomWasmModule | null {
  if (backend === 'gzdoom-s-wasm') return getGzdoomSModule();
  if (backend === 'gzdoom-wasm') return getHostedGzdoomModule();
  return getHostedGzdoomModule() ?? getGzdoomSModule();
}

function notifyGzdoomPointerLock(backend: RenderBackend, locked: boolean): void {
  activeGzdoomWasmModule(backend)?._gzr_on_pointer_lock?.(locked ? 1 : 0);
}

function isGzdoomPlayMode(backend: RenderBackend, subView: 'gold' | 'play'): boolean {
  return backend === 'gzdoom-s-wasm' || (backend === 'gzdoom-wasm' && subView === 'play');
}

export const LevelViewer: React.FC<{
  onWadChange?: (wad: Wad | null) => void;
}> = ({ onWadChange }) => {
  const automapCanvasRef = useRef<HTMLCanvasElement>(null);
  const bspDebugCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<GameRenderer | null>(null);
  const [webglInitError, setWebglInitError] = useState<string | null>(null);
  const [transitionPhase, setTransitionPhase] = useState<TransitionPhase>('loading');
  const loadStartedAtRef = useRef(0);
  const [automapActive, setAutomapActive] = useState(false);
  const [bspDebugActive, setBspDebugActive] = useState(false);
  const [labelGridActive, setLabelGridActive] = useState(
    () => new URLSearchParams(window.location.search).has('labels')
  );
  const [renderBackend, setRenderBackendState] = useState<RenderBackend>(readDefaultRenderBackend);
  const [renderLayerToggles, setRenderLayerTogglesState] = useState<RenderLayerToggles>(
    readStoredRenderLayerToggles
  );
  const gzdoomHadReadyRef = useRef(false);
  const [layersDrawerOpen, setLayersDrawerOpen] = useState(false);
  const layerSummary = useMemo(
    () => summarizeLayerToggles(renderLayerToggles, isGzdoomWasmFamily(renderBackend)),
    [renderLayerToggles, renderBackend],
  );
  const [modularStageCap, setModularStageCapState] = useState<ModularRenderStage | null>(() =>
    parseModularRenderStage(new URLSearchParams(window.location.search).get('modStage')),
  );
  const [pathTraceHud, setPathTraceHud] = useState('');
  const [federatedWasmHud, setFederatedWasmHud] = useState('');
  const [gzdoomWasmHud, setGzdoomWasmHud] = useState('');
  const [gzdoomGoldDiffHud, setGzdoomGoldDiffHud] = useState('');
  const gzdoomCanvasRef = useRef<HTMLCanvasElement>(null);
  const [gzdoomPlayCanvasLive, setGzdoomPlayCanvasLive] = useState(false);
  const bindGzdoomCanvas = useCallback((node: HTMLCanvasElement | null) => {
    gzdoomCanvasRef.current = node;
    setGzdoomPlayCanvasLive(node != null);
  }, []);
  /** Gold = WASM spawn frame (Phase 2c). Play = GZDoom WASM hosted renderer. */
  const [gzdoomSubView, setGzdoomSubView] = useState<'gold' | 'play'>('play');
  const [visibilityHud, setVisibilityHud] = useState('');
  const [automapCheat, setAutomapCheat] = useState<AutomapCheatLevel>(0);
  const [loadTick, setLoadTick] = useState(0);
  const cheatBufferRef = useRef('');

  useLayoutEffect(() => {
    if (!gameCanvasRef.current || game) return;
    try {
      const instance = renderGame(gameCanvasRef.current);
      instance.setRenderBackend(backendForMapLoad(renderBackend));
      setWebglInitError(null);
      setGame(instance);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[LevelViewer] WebGL init failed:', error);
      setWebglInitError(msg);
    }
  }, [game, renderBackend]);

  const [modPaths] = useState<string[]>(() => {
    const raw = new URLSearchParams(window.location.search).get('mods');
    if (!raw) return [];
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  });

  const {
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
  } = useDoomLoader({
    game,
    modPaths,
    renderBackend,
    gzdoomCanvasRef,
    gzdoomPlayCanvasLive,
    loadGzdoomPlay: isGzdoomPlayMode(renderBackend, gzdoomSubView),
    captureGzdoomGold: renderBackend === 'gzdoom-wasm' && gzdoomSubView === 'gold',
    renderLayerToggles,
  });

  useEffect(() => {
    if (wadPath) return;
    if (isGzdoomWasmFamily(renderBackend) || game) {
      setWadPath(PLAYABLE_WAD_OPTIONS[0]?.path ?? '/wads/DOOM.WAD');
    }
  }, [game, wadPath, setWadPath, renderBackend]);

  useEffect(() => {
    if (renderBackend !== 'gzdoom-wasm') {
      setGzdoomSubView('play');
    }
  }, [renderBackend, selectedMap, wadPath]);

  useEffect(() => {
    const shell = document.querySelector('.app-shell');
    const hero = document.querySelector('.hero');
    const immersive =
      (isGzdoomPlayMode(renderBackend, gzdoomSubView) && classicPlayState === 'ready') ||
      (renderBackend === 'gzdoom-wasm' && gzdoomSubView === 'gold' && mapLoadState === 'ready') ||
      (!isGzdoomWasmFamily(renderBackend) && mapLoadState === 'ready' && transitionPhase === 'playing');
    shell?.classList.toggle('app-shell--playing', immersive);
    hero?.classList.toggle('hero--compact', immersive);
    return () => {
      shell?.classList.remove('app-shell--playing');
      hero?.classList.remove('hero--compact');
    };
  }, [mapLoadState, renderBackend, transitionPhase, gzdoomSubView, classicPlayState]);

  useEffect(() => {
    if (!isGzdoomPlayMode(renderBackend, gzdoomSubView) || classicPlayState !== 'ready') return;
    setTransitionPhase('playing');
  }, [renderBackend, gzdoomSubView, classicPlayState]);

  useEffect(() => {
    if (renderBackend !== 'gzdoom-wasm' || !gzdoomFrameUrl || !wadPath || !selectedMap) {
      setGzdoomGoldDiffHud('');
      return;
    }
    const iwad = wadPath.toUpperCase().includes('DOOM2') ? 'DOOM2' : 'DOOM';
    const refPath = `/artifacts/gzrender-v2/gold-standard/${iwad}/${selectedMap}/ref.png`;
    void fetch(refPath, { method: 'HEAD' })
      .then((res) => {
        setGzdoomGoldDiffHud(
          res.ok
            ? `Gold: ${refPath} · switch to Play to walk`
            : 'Run npm run gold-standard:materialize for live diff',
        );
      })
      .catch(() => setGzdoomGoldDiffHud(''));
  }, [renderBackend, gzdoomFrameUrl, wadPath, selectedMap]);

  useEffect(() => {
    const loadingPlay = classicPlayState === 'loading' && classicLoadStartedAt != null;
    const loadingGold = mapLoadState === 'loading' && goldCaptureStartedAt != null;
    if (!loadingPlay && !loadingGold) return;
    const id = window.setInterval(() => setLoadTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [classicPlayState, classicLoadStartedAt, mapLoadState, goldCaptureStartedAt]);

  const music = useLevelMusic(wad, selectedMap, wadPath);

  useEffect(() => {
    if (!game) return;
    game.setRenderBackend(backendForMapLoad(renderBackend));
    persistRenderBackend(renderBackend);
    if (renderBackend === 'pathtrace') {
      void import('@/wad/renderer/rtgl/loadRtglBackend').then(({ loadRtglBackend }) => loadRtglBackend());
    }
    if (renderBackend === 'wasm-federated') {
      void import('@/wad/renderer/gzrender-v2/federated/loadFederatedWasmBackend').then(({ loadFederatedWasmBackend }) =>
        loadFederatedWasmBackend(),
      );
    }
    if (!isGzdoomWasmFamily(renderBackend)) {
      setGzdoomWasmHud('');
    }
  }, [game, renderBackend]);

  useEffect(() => {
    if (classicPlayState === 'ready' && isGzdoomWasmFamily(renderBackend)) {
      gzdoomHadReadyRef.current = true;
    }
  }, [classicPlayState, renderBackend]);

  useEffect(() => {
    if (renderBackend === 'gzdoom-s-wasm') {
      if (classicPlayState === 'loading') {
        setGzdoomWasmHud(
          gzdoomHadReadyRef.current
            ? `GZDoom (s) · ${selectedMap} · loading…`
            : `GZDoom (s) · ${selectedMap} · Node GZSTATE → WASM…`,
        );
      } else if (classicPlayState === 'ready') {
        setGzdoomWasmHud(`GZDoom (s) · ${selectedMap} · Node-fed map · click to play · WASD + mouse`);
      } else if (classicPlayState === 'error') {
        setGzdoomWasmHud(`GZDoom (s) failed: ${gzdoomWasmError ?? 'see console'}`);
      }
      return;
    }
    if (renderBackend !== 'gzdoom-wasm') return;
    if (gzdoomSubView === 'play') {
      if (classicPlayState === 'loading') {
        setGzdoomWasmHud(`Play · ${selectedMap} · loading GZDoom WASM…`);
      } else if (classicPlayState === 'ready') {
        setGzdoomWasmHud(`Play · ${selectedMap} · GZDoom in WASM · click to play · WASD + mouse · Space=use`);
      } else if (classicPlayState === 'error') {
        setGzdoomWasmHud(`Classic play failed — try Classic renderer or Clear Cache`);
      }
      return;
    }
    if (mapLoadState === 'loading') {
      setGzdoomWasmHud(`GZDoom WASM · capturing ${selectedMap} gold (background)…`);
    } else if (mapLoadState === 'ready' && selectedMap) {
      if (gzdoomSubView === 'play') {
        if (classicPlayState === 'loading') {
          setGzdoomWasmHud(`GZDoom WASM · ${selectedMap} · loading renderer…`);
        } else if (classicPlayState === 'ready') {
          setGzdoomWasmHud(`Play · ${selectedMap} · GZDoom in WASM · click to play · WASD + mouse · Space=use`);
        } else if (classicPlayState === 'error') {
          setGzdoomWasmHud(`GZDoom WASM failed: ${gzdoomWasmError}`);
        }
      } else {
        setGzdoomWasmHud(`Gold · ${selectedMap} · WASM spawn frame (Phase 2c)`);
      }
    } else if (mapLoadState === 'error' && gzdoomWasmError) {
      setGzdoomWasmHud(`GZDoom WASM failed: ${gzdoomWasmError}`);
    }
  }, [renderBackend, mapLoadState, selectedMap, gzdoomWasmError, gzdoomSubView, classicPlayState, game]);

  useEffect(() => {
    if (!game) return;
    if (isGzdoomWasmFamily(renderBackend)) return;
    applyClassicLayerTogglesLive(game, renderLayerToggles);
  }, [game, renderLayerToggles, renderBackend]);

  /** Puppeteer / screenshot tools — apply preset without DOM clicks (avoids tsx __name in evaluate). */
  useEffect(() => {
    if (!game || isGzdoomWasmFamily(renderBackend)) {
      delete (window as unknown as { __applyClassicLayerPreset?: unknown }).__applyClassicLayerPreset;
      return;
    }
    (window as unknown as {
      __applyClassicLayerPreset?: (layerId: string) => ReturnType<typeof applyClassicLayerTogglesLive>;
    }).__applyClassicLayerPreset = (layerId: string) => {
      const toggles = classicLayerTestPreset(layerId);
      if (!toggles) return null;
      setRenderLayerTogglesState(toggles);
      persistRenderLayerToggles(toggles);
      return applyClassicLayerTogglesLive(game, toggles);
    };
    return () => {
      delete (window as unknown as { __applyClassicLayerPreset?: unknown }).__applyClassicLayerPreset;
    };
  }, [game, renderBackend]);

  useEffect(() => {
    if (renderBackend !== 'pathtrace' || !game) return;
    const id = window.setInterval(() => {
      void game.getPathTraceDebugInfo()?.then((info) => {
        if (!info) return;
        if (info.traceBackend === 'gpu') {
          const errSuffix = info.error ? ` · ${info.error}` : '';
          const scalePct = Math.round((info.traceScale ?? 0.45) * 100);
          setPathTraceHud(
            `GPU rays · ${info.triangleCount} tris · ${info.traceWidth}×${info.traceHeight} @ ${scalePct}% · ${info.traceMs} ms${errSuffix}`
          );
        } else {
          setPathTraceHud(`GPU failed · ${info.error ?? 'unknown error'}`);
        }
      });
    }, 500);
    return () => window.clearInterval(id);
  }, [renderBackend, game]);

  useEffect(() => {
    onWadChange?.(wad);
  }, [wad, onWadChange]);

  const handleRenderBackendChange = useCallback((backend: RenderBackend) => {
    setRenderBackendState(backend);
  }, []);

  const handleRenderLayerChange = useCallback((next: RenderLayerToggles) => {
    setRenderLayerTogglesState(next);
    persistRenderLayerToggles(next);
  }, []);

  useEffect(() => {
    if (!isGzdoomWasmFamily(renderBackend) || classicPlayState !== 'ready') return;
    try {
      const mod =
        renderBackend === 'gzdoom-s-wasm' ? getGzdoomSModule() : getHostedGzdoomModule();
      if (mod?._gzr_is_ready?.() !== 1) return;
      applyGzdoomLayerTogglesLive(mod, renderLayerToggles);
    } catch (err) {
      console.warn('[LevelViewer] live layer toggle failed:', err);
    }
  }, [renderBackend, classicPlayState, renderLayerToggles]);

  const handleModularStageCapChange = useCallback((stage: ModularRenderStage | null) => {
    setModularStageCapState(stage);
    const url = new URL(window.location.href);
    if (stage) url.searchParams.set('modStage', stage);
    else url.searchParams.delete('modStage');
    window.history.replaceState(null, '', url.toString());
  }, []);

  const levelDataReady =
    isGzdoomWasmFamily(renderBackend)
      ? isGzdoomPlayMode(renderBackend, gzdoomSubView)
        ? classicPlayState === 'ready'
        : mapLoadState === 'ready'
      : mapLoadState === 'ready';
  const isPlaying =
    isGzdoomWasmFamily(renderBackend)
      ? isGzdoomPlayMode(renderBackend, gzdoomSubView)
        ? classicPlayState === 'ready'
        : mapLoadState === 'ready'
      : transitionPhase === 'playing';
  const showGoldFrame =
    renderBackend === 'gzdoom-wasm' && gzdoomSubView === 'gold' && Boolean(gzdoomFrameUrl);
  const classicLoadElapsedSec =
    classicPlayState === 'loading' && classicLoadStartedAt != null
      ? Math.floor((Date.now() - classicLoadStartedAt) / 1000)
      : 0;
  const goldCaptureElapsedSec =
    mapLoadState === 'loading' && goldCaptureStartedAt != null
      ? Math.floor((Date.now() - goldCaptureStartedAt) / 1000)
      : 0;
  void loadTick;
  const gzdoomPlaySubview = isGzdoomPlayMode(renderBackend, gzdoomSubView);
  const showGzdoomPlayCanvas = gzdoomPlaySubview && classicPlayState === 'ready';
  const showPerfMeterOverlay =
    !showGoldFrame &&
    !automapActive &&
    (showGzdoomPlayCanvas || (renderBackend === 'classic' && isPlaying));
  const sfx = useLevelSfx(showGzdoomPlayCanvas, wad, wadPath);
  const showClassicPlayLoading =
    gzdoomPlaySubview &&
    classicPlayState !== 'ready' &&
    classicPlayState !== 'error' &&
    Boolean(wadPath);
  const showGoldCaptureLoading =
    renderBackend === 'gzdoom-wasm' && gzdoomSubView === 'gold' && mapLoadState === 'loading';
  const showGoldCaptureError =
    renderBackend === 'gzdoom-wasm' && gzdoomSubView === 'gold' && mapLoadState === 'error';
  const gzdoomLoadOverlayVariant =
    renderBackend === 'gzdoom-s-wasm'
      ? 'modular-s'
      : gzdoomSubView === 'gold'
        ? 'wasm-gold'
        : 'wasm-play';
  const showGzdoomPlayError =
    gzdoomPlaySubview && classicPlayState === 'error' && Boolean(gzdoomWasmError);

  // Hide legacy #fps-counter when PerfMeter overlay is active (unified fps/ms + sparkline chart).
  useEffect(() => {
    const tsRenderer = renderBackend === 'classic' || renderBackend === 'wasm-federated';
    const voxel = document.getElementById('voxel-counter');
    const fps = document.getElementById('fps-counter');
    if (voxel) voxel.style.display = tsRenderer && !showPerfMeterOverlay ? '' : 'none';
    if (fps) fps.style.display = tsRenderer && !showPerfMeterOverlay ? '' : 'none';
    return () => {
      if (voxel) voxel.style.display = '';
      if (fps) fps.style.display = '';
    };
  }, [renderBackend, showPerfMeterOverlay]);

  // Mouse-look for GZDoom WASM play: SDL's Emscripten relative-mouse path delivers no deltas, so we
  // own pointer lock here and forward the browser's reliable movementX/Y straight into GZDoom via
  // the gzr_mouse_move export. pointerlockchange also re-syncs cursor show/hide state.
  useEffect(() => {
    if (!showGzdoomPlayCanvas) return;
    const canvas = gzdoomCanvasRef.current;
    if (!canvas) return;

    const syncLockState = () => {
      const locked = document.pointerLockElement === canvas;
      notifyGzdoomPointerLock(renderBackend, locked);
      return locked;
    };

    const onPointerLockChange = () => {
      syncLockState();
    };
    const onMouseMove = (e: MouseEvent) => {
      // Do not rely on a cached flag — pointerlockchange can race mousedown / effect mount.
      if (document.pointerLockElement !== canvas) return;
      const mod = activeGzdoomWasmModule(renderBackend);
      if (mod?._gzr_mouse_move && (e.movementX || e.movementY)) {
        mod._gzr_mouse_move(e.movementX, e.movementY);
      }
    };
    syncLockState();
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mousemove', onMouseMove);
    return () => {
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      // Pointer lock is document-global. If we tear down (e.g. switch to Classic) while still
      // locked to the GZDoom canvas, the lock stays stuck on this now-hidden canvas and the next
      // renderer sees pointerLockElement !== its own canvas → mouse appears "disabled". Release it.
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
      notifyGzdoomPointerLock(renderBackend, false);
    };
  }, [showGzdoomPlayCanvas, gzdoomCanvasRef, renderBackend]);

  useEffect(() => {
    if (renderBackend !== 'wasm-federated' || !game) return;
    const id = window.setInterval(() => {
      const info = game.getFederatedWasmDebugInfo?.();
      if (!info) return;
      void info.then((debug) => {
        if (!debug) return;
        const engineLabel =
          debug.engineMode === 'wasm' && debug.engineWasmLoaded
            ? 'engine WASM'
            : debug.engineMode === 'wasm'
              ? 'engine WASM→TS fallback'
              : 'engine TS';
        const patchSuffix =
          debug.patchesLastFrame > 0 ? ` · ${debug.patchesLastFrame} patches` : '';
        const voxelSuffix =
          debug.voxelsDrawn != null
            ? ` · vox ${debug.voxelsDrawn}${debug.voxelsPending ? `/${debug.voxelsPending} pend` : ''}`
            : '';
        const errSuffix = debug.error ? ` · ${debug.error}` : '';
        setFederatedWasmHud(
          `Federated · ${engineLabel} + renderer WASM · ${debug.mapName || '—'} · ${debug.vertexCount}v ${debug.sectorCount}s · GZSTATE ${Math.round(debug.gzstateBytes / 1024)}KB${patchSuffix}${voxelSuffix}${errSuffix}`,
        );
      });
    }, 400);
    return () => window.clearInterval(id);
  }, [renderBackend, game, isPlaying]);

  useEffect(() => {
    if ((renderBackend !== 'classic' && renderBackend !== 'wasm-federated') || !game || !isPlaying) return;
    const id = window.setInterval(() => {
      const stats = (window as unknown as { __doomDrawStats?: Record<string, unknown> }).__doomDrawStats;
      if (!stats) return;
      const cam = stats.cameraSectorIndex ?? '?';
      const flat42 = stats.courtyardFlat42 ? 'yes' : 'no';
      const mode = stats.flatDrawMode ?? '?';
      setVisibilityHud(
        `BSP · sector ${cam} · flat42 ${flat42} · ${mode} · walls ${stats.wallEntries ?? 0} flats ${stats.flatSubsectors ?? 0} · drawn w${stats.walls ?? 0} f${stats.flats ?? 0}${Array.isArray(stats.inactiveLayers) && stats.inactiveLayers.length ? ` · off: ${(stats.inactiveLayers as string[]).slice(0, 3).join(',')}` : ''}${stats.wireframeMode && stats.wireframeMode !== 'off' ? ` · wire ${stats.wireframeMode}` : ''}`
      );
    }, 400);
    return () => window.clearInterval(id);
  }, [renderBackend, game, isPlaying]);

  useEffect(() => {
    loadStartedAtRef.current = performance.now();
    if (renderBackend === 'pathtrace' || isGzdoomWasmFamily(renderBackend)) {
      setTransitionPhase('playing');
    } else if (renderBackend === 'wasm-federated') {
      setTransitionPhase('loading');
      game?.setPresentationVisible(false);
    } else {
      setTransitionPhase('loading');
      game?.setPresentationVisible(false);
    }
    setAutomapActive(false);
    setBspDebugActive(false);
    setAutomapCheat(0);
    cheatBufferRef.current = '';
    game?.setAutomapActive(false);
    game?.setBspDebugActive(false);
  }, [selectedMap, wadPath, game, renderBackend]);

  useEffect(() => {
    if (!levelDataReady || !wad || !selectedMap) {
      return;
    }

    if (isGzdoomWasmFamily(renderBackend)) {
      setTransitionPhase('playing');
      return;
    }

    if (!game) return;

    let cancelled = false;

    (async () => {
      if (renderBackend === 'pathtrace') {
        game.setPresentationVisible(true);
        if (!cancelled) {
          setTransitionPhase('playing');
        }
        return;
      }

      if (readFrameParityModeFromLocation()) {
        game.setPresentationVisible(true);
        if (!cancelled) {
          setTransitionPhase('playing');
        }
        return;
      }

      const elapsed = performance.now() - loadStartedAtRef.current;
      const remaining = MIN_LOADING_SCREEN_MS - elapsed;
      if (remaining > 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
      }

      game.setPresentationVisible(true);
      await game.waitForRenderedFrame();

      if (!cancelled) {
        setTransitionPhase('wiping');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [levelDataReady, wad, selectedMap, wadPath, game, renderBackend]);

  const handleSnapshotCaptured = useCallback(() => {
    game?.setPresentationVisible(false);
  }, [game]);

  const handleWipeComplete = useCallback(() => {
    game?.setPresentationVisible(true);
    setTransitionPhase('playing');
    if (music.enabled) {
      music.play();
    }
  }, [music]);

  const toggleAutomap = useCallback(() => {
    setAutomapActive((active) => {
      const next = !active;
      game?.setAutomapActive(next);
      if (next) {
        setBspDebugActive(false);
        game?.setBspDebugActive(false);
      }
      return next;
    });
  }, [game]);

  const toggleBspDebug = useCallback(() => {
    setBspDebugActive((active) => {
      const next = !active;
      game?.setBspDebugActive(next);
      if (next) {
        setAutomapActive(false);
        game?.setAutomapActive(false);
      }
      return next;
    });
  }, [game]);

  const triggerIddt = useCallback(() => {
    setAutomapCheat((level) => cycleAutomapCheat(level));
    setAutomapActive(true);
    game?.setAutomapActive(true);
  }, [game]);

  useEffect(() => {
    if (!isPlaying) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Tab') {
        event.preventDefault();
        toggleAutomap();
        return;
      }

      if (event.code === 'KeyV') {
        event.preventDefault();
        toggleBspDebug();
        return;
      }

      if (event.code === 'KeyL') {
        event.preventDefault();
        setLabelGridActive((active) => !active);
        return;
      }

      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const tag = (event.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

        cheatBufferRef.current = appendCheatChar(cheatBufferRef.current, event.key);
        if (cheatTriggered(cheatBufferRef.current, 'iddt')) {
          cheatBufferRef.current = '';
          event.preventDefault();
          triggerIddt();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPlaying, toggleAutomap, toggleBspDebug, triggerIddt]);

  useEffect(() => {
    if (!bspDebugActive || !isPlaying || !wad || !selectedMap || !game) return;

    const map = wad.maps[selectedMap];
    if (!map) return;

    const index = buildBspRenderIndex(map);
    if (!index) return;

    let frame = 0;
    const drawFrame = () => {
      const canvas = bspDebugCanvasRef.current;
      const player = game.getPlayerState();
      if (canvas && player) {
        drawBspDebugView(canvas, map, {
          player,
          index,
          traceYaw: game.getBspTraceYaw(),
        });
      }
      frame = requestAnimationFrame(drawFrame);
    };

    frame = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(frame);
  }, [bspDebugActive, isPlaying, wad, selectedMap, game]);

  useEffect(() => {
    if (!automapActive || !isPlaying || !wad || !selectedMap || !game) return;

    const map = wad.maps[selectedMap];
    if (!map) return;

    let frame = 0;
    const drawFrame = () => {
      const canvas = automapCanvasRef.current;
      const player = game.getPlayerState();
      if (canvas && player) {
        drawAutomap(canvas, map, {
          player: { ...player, yaw: game.getBspTraceYaw() },
          cheatLevel: automapCheat,
        });
      }
      frame = requestAnimationFrame(drawFrame);
    };

    frame = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(frame);
  }, [automapActive, automapCheat, isPlaying, wad, selectedMap, game]);

  const gzdoomMapLoading = gzdoomPlaySubview ? classicPlayState === 'loading' : mapLoadState === 'loading';
  const transitionPhaseProp = transitionPhase === 'wiping' ? 'wipe' : 'loading';
  const showTransition =
    Boolean(wad && selectedMap) &&
    renderBackend !== 'pathtrace' &&
    !isGzdoomWasmFamily(renderBackend) &&
    (mapLoadState === 'loading' || transitionPhase !== 'playing');
  const hideGameCanvas = isGzdoomWasmFamily(renderBackend)
    ? true
    : renderBackend !== 'pathtrace' && transitionPhase !== 'playing';

  const isGzdoomWasmLoading =
    isGzdoomWasmFamily(renderBackend) &&
    ((gzdoomPlaySubview && classicPlayState !== 'ready' && classicPlayState !== 'error') ||
      (renderBackend === 'gzdoom-wasm' && gzdoomSubView === 'gold' && mapLoadState === 'loading'));

  const isImmersivePlay =
    isPlaying || (isGzdoomWasmFamily(renderBackend) && mapLoadState === 'ready');

  const viewerClassName = [
    'doom-panel',
    'level-viewer',
    isImmersivePlay ? 'level-viewer--playing' : '',
    isGzdoomWasmLoading ? 'level-viewer--gzdoom-loading' : '',
    showGoldFrame ? 'level-viewer--gzdoom-gold' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const shellClassName = [
    'level-viewer-shell',
    layersDrawerOpen ? 'level-viewer-shell--layers-open' : '',
    isImmersivePlay ? 'level-viewer-shell--playing' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClassName}>
      <section
        className={viewerClassName}
        data-map-load-state={mapLoadState}
        data-classic-play-state={classicPlayState}
        data-is-playing={isPlaying ? 'true' : 'false'}
      >
      <nav className="layer-rail" aria-label="Render layers">
        <button
          type="button"
          className={`layer-rail__toggle${layersDrawerOpen ? ' layer-rail__toggle--open' : ''}`}
          aria-expanded={layersDrawerOpen}
          aria-controls="layer-drawer"
          title={layersDrawerOpen ? 'Hide render layers' : 'Show render layers'}
          onClick={() => setLayersDrawerOpen((open) => !open)}
        >
          <span className="layer-rail__toggle-bars" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="layer-rail__toggle-label">Layers</span>
          <span className="layer-rail__toggle-hint">{layerSummary}</span>
        </button>
        <aside
          id="layer-drawer"
          className={`layer-rail__drawer${layersDrawerOpen ? ' layer-rail__drawer--open' : ''}`}
          aria-hidden={!layersDrawerOpen}
        >
          <RenderLayerPanel
            toggles={renderLayerToggles}
            onChange={handleRenderLayerChange}
            disabled={gzdoomPlaySubview && classicPlayState === 'loading'}
            renderBackend={renderBackend}
            modularStageCap={modularStageCap}
            onModularStageCapChange={handleModularStageCapChange}
          />
        </aside>
      </nav>

      <header className="level-chrome">
        <div className="level-chrome__row">
          <div className="level-chrome__selects">
            <label className="control-field">
              <span className="control-field__label">IWAD</span>
              <select
                className="control-field__input"
                value={wadPath ?? ''}
                onChange={(e) => setWadPath(e.target.value || null)}
              >
                <option value="" disabled>
                  Select WAD
                </option>
                {PLAYABLE_WAD_OPTIONS.map((wadOption) => (
                  <option key={wadOption.id} value={wadOption.path}>
                    {wadOption.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="control-field">
              <span className="control-field__label">Map</span>
              <select
                className="control-field__input control-field__input--map"
                value={selectedMap}
                onChange={(e) => setSelectedMap(e.target.value)}
                disabled={mapNames.length === 0}
              >
                {mapNames.length === 0 ? (
                  <option value="">—</option>
                ) : (
                  mapNames.map((mapName) => (
                    <option key={mapName} value={mapName}>
                      {mapName}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="control-field">
              <span className="control-field__label">Engine</span>
              <select
                className="control-field__input control-field__input--engine"
                value={renderBackend}
                onChange={(e) => handleRenderBackendChange(e.target.value as RenderBackend)}
              >
                <option value="gzdoom-wasm">GZDoom gold</option>
                <option value="gzdoom-s-wasm">GZDoom modular (s)</option>
                <option value="classic">Classic WebGL</option>
                <option value="pathtrace">Path trace</option>
              </select>
            </label>
          </div>

          <div className="level-chrome__actions">
            {renderBackend === 'gzdoom-wasm' ? (
              <div className="segmented-control" role="group" aria-label="GZDoom mode">
                <button
                  type="button"
                  className={gzdoomSubView === 'play' ? 'active' : ''}
                  onClick={() => setGzdoomSubView('play')}
                  disabled={gzdoomSubView === 'play' ? classicPlayState === 'loading' : mapLoadState !== 'ready'}
                >
                  Play
                </button>
                <button
                  type="button"
                  className={gzdoomSubView === 'gold' ? 'active' : ''}
                  onClick={() => setGzdoomSubView('gold')}
                  disabled={gzdoomSubView === 'gold'}
                >
                  Gold
                </button>
              </div>
            ) : null}
            <button type="button" className="chrome-btn" onClick={refreshWad} disabled={!wadPath}>
              Refresh
            </button>
            <button type="button" className="chrome-btn chrome-btn--ghost" onClick={clearCache}>
              Clear cache
            </button>
          </div>

          <div className="level-chrome__audio">
            <div className="audio-chip" title="Sound effects">
              <button
                type="button"
                className={`audio-chip__btn ${!sfx.muted ? 'active' : ''}`}
                onClick={() => {
                  sfx.unlock();
                  sfx.toggleMuted();
                }}
                disabled={!isGzdoomWasmFamily(renderBackend)}
                aria-pressed={!sfx.muted}
                aria-label={sfx.muted ? 'Unmute sound effects' : 'Mute sound effects'}
              >
                <MuteIcon muted={sfx.muted} />
              </button>
              <span className="audio-chip__label">SFX</span>
              <span className="audio-chip__status">
                {!isGzdoomWasmFamily(renderBackend) ? '—' : sfx.muted ? 'Off' : 'On'}
              </span>
            </div>
            <div className="audio-chip" title={music.currentLump ?? 'Level music'}>
              <MusicVisualizer active={music.enabled && music.playing} />
              <button
                type="button"
                className={`audio-chip__btn ${music.enabled ? 'active' : ''}`}
                onClick={music.toggle}
                disabled={!wad || !selectedMap || mapLoadState !== 'ready'}
                aria-pressed={music.enabled}
                aria-label={music.enabled ? 'Mute music' : 'Play music'}
              >
                <MuteIcon muted={!music.enabled} />
              </button>
              <span className="audio-chip__label">Music</span>
              <span className="audio-chip__status">{music.status}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="level-viewer__body">
        <div className="level-viewer__main">
      <DoomLoader
        status={status}
        wad={wad}
        wadPath={wadPath}
        mapNames={mapNames}
        renderBackend={renderBackend}
        mapLoading={
          isGzdoomWasmFamily(renderBackend) ? gzdoomMapLoading : mapLoadState === 'loading'
        }
        mapLoadMode={
          renderBackend === 'gzdoom-s-wasm'
            ? 'gzdoom-s-wasm'
            : renderBackend === 'gzdoom-wasm'
              ? 'gzdoom-wasm'
              : renderBackend === 'wasm-federated'
                ? 'federated'
                : 'classic'
        }
      />

      <div className="game-stage">
        <figure className={`canvas-card game-card ${hideGameCanvas ? 'game-card--hidden' : ''}`}>
          <figcaption className="game-card__caption">
            {renderBackend === 'pathtrace'
              ? 'GPU preview · ~10 fps cap · switch to Classic to play'
              : renderBackend === 'wasm-federated'
                ? 'GZRender federated · GZSTATE + WASM host · classic WebGL draw'
                : renderBackend === 'gzdoom-s-wasm'
                  ? 'GZDoom (s) WASM · Node GZSTATE map load · full engine + renderer'
                : renderBackend === 'gzdoom-wasm'
                  ? gzdoomSubView === 'play'
                    ? 'GZDoom in WASM · full game · click to play · WASD + mouse · Space = use/open'
                    : 'GZDoom WASM · Phase 2 gold renderer · spawn view vs ref.png'
                  : 'Classic HW · BSP submit + Z (solids) · debug/legacy'}
            <span>Tab automap · V BSP debug · L label grid</span>
          </figcaption>
          <div className="game-card__viewport" ref={viewportRef}>
            <canvas
              ref={gameCanvasRef}
              className={`game-canvas ${automapActive ? 'game-canvas--automap' : ''} ${bspDebugActive ? 'game-canvas--bsp-debug' : ''} ${hideGameCanvas ? 'game-canvas--hidden' : ''}`}
              tabIndex={0}
            />
            {selectedMap && gzdoomPlaySubview ? (
            <canvas
              ref={bindGzdoomCanvas}
              /* Stable key per backend — map switches restart WASM via effect deps, not canvas remount.
                 Remounting mid-init destroys the canvas Emscripten bound to (black screen / no handlers). */
              key={`gz-${renderBackend}-play`}
              width={1280}
              height={960}
              className={`gzdoom-wasm-play-canvas${showClassicPlayLoading ? ' gzdoom-wasm-play-canvas--loading' : ''}`}
              tabIndex={showGzdoomPlayCanvas ? 0 : -1}
              aria-hidden={!showGzdoomPlayCanvas}
              onMouseDown={
                showGzdoomPlayCanvas
                  ? (e) => {
                      const c = e.currentTarget;
                      c.focus();
                      const lockPromise = c.requestPointerLock?.();
                      if (lockPromise && typeof lockPromise.then === 'function') {
                        void lockPromise.then(() => notifyGzdoomPointerLock(renderBackend, true));
                      }
                    }
                  : undefined
              }
            />
            ) : null}
            {showGoldFrame ? (
              <img src={gzdoomFrameUrl!} alt={`GZDoom WASM ${selectedMap}`} className="gzdoom-wasm-frame" />
            ) : null}
            <PerfMeter active={showPerfMeterOverlay} />
            {showClassicPlayLoading ? (
              <GzdoomPlayLoadingOverlay
                title={renderBackend === 'gzdoom-s-wasm' ? 'GZDoom (s) WASM' : 'GZDoom WASM'}
                progress={gzdoomLoadProgress}
                elapsedSec={classicLoadElapsedSec}
                variant={gzdoomLoadOverlayVariant}
              />
            ) : null}
            {showGoldCaptureLoading ? (
              <GzdoomPlayLoadingOverlay
                title="GZDoom WASM · Gold"
                progress={gzdoomGoldLoadProgress}
                elapsedSec={goldCaptureElapsedSec}
                variant="wasm-gold"
              />
            ) : null}
            {showGzdoomPlayError ? (
              <div className="gzdoom-play-loading gzdoom-play-error" aria-live="assertive" role="alert">
                {renderBackend === 'gzdoom-s-wasm' ? 'GZDoom (s) failed' : 'GZDoom WASM failed'}
                <br />
                <span className="gzdoom-play-error__detail">{gzdoomWasmError}</span>
                {renderBackend === 'gzdoom-s-wasm' &&
                gzdoomWasmError?.includes('gzdoom-s') ? (
                  <>
                    <br />
                    <span className="gzdoom-play-error__hint">
                      Run: npm run bootstrap:gzdoom-s
                    </span>
                  </>
                ) : null}
              </div>
            ) : null}
            {showGoldCaptureError ? (
              <div className="gzdoom-play-loading gzdoom-play-error" aria-live="assertive" role="alert">
                GZDoom gold capture failed
                <br />
                <span className="gzdoom-play-error__detail">{gzdoomWasmError}</span>
              </div>
            ) : null}
            <canvas
              ref={automapCanvasRef}
              className={`automap-canvas ${automapActive ? 'automap-canvas--active' : ''}`}
              aria-hidden={!automapActive}
            />
            <canvas
              ref={bspDebugCanvasRef}
              className={`bsp-debug-canvas ${bspDebugActive ? 'bsp-debug-canvas--active' : ''}`}
              aria-hidden={!bspDebugActive}
            />
            <DoomLevelTransition
              active={showTransition}
              phase={transitionPhaseProp}
              wad={wad}
              mapLabel={selectedMap}
              gameCanvasRef={gameCanvasRef}
              viewportRef={viewportRef}
              onSnapshotCaptured={handleSnapshotCaptured}
              onComplete={handleWipeComplete}
            />
            {automapActive ? (
              <div className="automap-hud" aria-live="polite">
                AUTOMAP · follow
                {automapCheat === 1 ? ' · ALL LINES' : automapCheat === 2 ? ' · ALL THINGS' : ''}
              </div>
            ) : null}
            {bspDebugActive ? (
              <div className="bsp-debug-hud" aria-live="polite">
                BSP VISIBILITY · 3D wireframe + 2D seg trace · green=visible · red=clip · yellow=backface
              </div>
            ) : null}
            <ViewportLabelGrid active={labelGridActive && isPlaying} />
            {labelGridActive && isPlaying ? (
              <div className="label-grid-hud" aria-live="polite">
                LABEL GRID · A–I · press L to hide
              </div>
            ) : null}
            {renderBackend === 'pathtrace' ? (
              <div className="path-trace-hud" aria-live="polite">
                {pathTraceHud || 'GPU rays · loading…'}
              </div>
            ) : renderBackend === 'wasm-federated' ? (
              <div className="path-trace-hud federated-wasm-hud" aria-live="polite">
                {federatedWasmHud || 'WASM federated · loading…'}
              </div>
            ) : renderBackend === 'gzdoom-wasm' || renderBackend === 'gzdoom-s-wasm' ? (
              <div className="path-trace-hud gzdoom-wasm-hud" aria-live="polite">
                {gzdoomWasmHud || 'GZDoom WASM · loading…'}
                {gzdoomGoldDiffHud ? <span className="gzdoom-gold-diff-hud"> · {gzdoomGoldDiffHud}</span> : null}
              </div>
            ) : isPlaying ? (
              <div className="path-trace-hud visibility-hud" aria-live="polite">
                {visibilityHud || 'BSP · loading…'}
              </div>
            ) : null}
          </div>
        </figure>
      </div>
        </div>
      </div>
    </section>
    </div>
  );
};

const DoomLoader: React.FC<{
  status: ReturnType<typeof useDoomLoader>['status'];
  wad: ReturnType<typeof useDoomLoader>['wad'];
  wadPath: string | null;
  mapNames: string[];
  renderBackend: RenderBackend;
  mapLoading: boolean;
  mapLoadMode?: 'classic' | 'gzdoom-wasm' | 'gzdoom-s-wasm' | 'federated';
}> = ({ status, wad, wadPath, mapNames, renderBackend, mapLoading, mapLoadMode = 'classic' }) => {
  const [loadElapsedSec, setLoadElapsedSec] = useState(0);

  useEffect(() => {
    if (!mapLoading) {
      setLoadElapsedSec(0);
      return;
    }
    const started = performance.now();
    const id = window.setInterval(() => {
      setLoadElapsedSec(Math.floor((performance.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [mapLoading]);

  const loadedAt = status.loadedAt ? new Date(status.loadedAt).toLocaleTimeString() : null;
  const isReady = status.state === 'ready' || status.state === 'cache-hit';
  const showProgress = !isReady || mapLoading || status.state === 'loading' || status.state === 'error';
  // GZDoom WASM never parses lumps in Node — no Z_Init/W_Init bar. GZDoom (s) uses the overlay
  // for lump parse + WASM; hide duplicate segmented bar while play is loading.
  const showWadSegmentedBar =
    !isGzdoomWasmFamily(renderBackend) && showProgress;
  const showDetail = showProgress && status.detail;

  return (
    <div
      className={`doom-loader doom-loader--compact ${status.state} ${mapLoading ? 'map-loading' : ''} ${isReady && !mapLoading ? 'is-settled' : ''}`}
    >
      <div className="loader-header">
        <div className="loader-title-group">
          <span className="loader-kicker">WAD Loader</span>
          <h2>
            {mapLoading
              ? mapLoadMode === 'gzdoom-s-wasm'
                ? 'GZDoom (s) WASM'
              : mapLoadMode === 'gzdoom-wasm'
                ? 'GZDoom WASM'
                : mapLoadMode === 'federated'
                  ? 'Federated WASM'
                  : 'P_SetupLevel'
              : status.title}
          </h2>
          {showDetail ? <p>{status.detail}</p> : null}
          {wad && isReady && !mapLoading ? (
            <div className="wad-stats wad-stats--inline">
              <span>{wad.indentification.trim()}</span>
              <span>{Object.keys(wad.maps).length} maps</span>
              <span>{wad.lumpInfo.length} lumps</span>
              {loadedAt ? <span>{loadedAt}</span> : null}
            </div>
          ) : renderBackend === 'gzdoom-wasm' && isReady && !mapLoading && mapNames.length > 0 ? (
            <div className="wad-stats wad-stats--inline">
              <span>{wadPath?.split('/').pop() ?? 'IWAD'}</span>
              <span>{mapNames.length} maps</span>
              <span>GZDoom parses lumps</span>
            </div>
          ) : null}
        </div>
        <div className="cache-badge">{status.fromCache ? 'CACHE HIT' : status.state.toUpperCase()}</div>
      </div>

      {showWadSegmentedBar ? (
        <div className="loader-segmented-bar" aria-label="Startup progress">
          {status.steps.map((step) => {
            const fill = step.complete ? 100 : Math.round(step.progress * 100);
            return (
              <div
                key={step.label}
                className={`loader-segment ${step.complete ? 'complete' : ''} ${step.active ? 'active' : ''}`}
                title={`${step.label}: ${step.message}`}
              >
                <span className="loader-segment__label">{step.label}</span>
                <span className="loader-segment__track">
                  <span className="loader-segment__fill" style={{ width: `${fill}%` }} />
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      <div
        className={`loader-status-line ${status.state === 'error' ? 'error-line' : ''}`}
        aria-live="polite"
      >
        {mapLoading
          ? mapLoadMode === 'gzdoom-s-wasm'
            ? `Node lump parse + GZDoom (s) WASM… (${loadElapsedSec}s)`
            : mapLoadMode === 'gzdoom-wasm'
              ? `GZDoom WASM renderer… (${loadElapsedSec}s)`
            : mapLoadMode === 'federated'
              ? `R_Init: federated GZSTATE + WASM… (${loadElapsedSec}s)`
              : `R_Init: building map geometry… (${loadElapsedSec}s)`
          : status.statusLine}
      </div>
    </div>
  );
};
