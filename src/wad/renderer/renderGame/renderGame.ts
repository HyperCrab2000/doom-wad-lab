import { Wad } from '@/wad/interfaces/Wad';
import { WadMap } from '@/wad/interfaces/WadMap';
import { animatedFlatFps, animatedSpriteFps, animatedWallFps } from '@/wad/constants/WadInfo';
import { mat4, vec3 } from 'gl-matrix';

import { setupCamera, updateCameraFromViewMatrix } from './camera';
import { drawScene } from './drawScene';
import {
  bindPlayfieldViewport,
  clearPathTraceLetterbox,
  clearPlayfieldChrome,
  createPlayfieldCamera,
  updatePlayfieldCamera,
} from '@/wad/renderer/renderGame/playfieldCamera';
import {
  doomVerticalFovDegrees,
  readFrameParityModeFromLocation,
  resolvePlayfieldLayout,
} from '@/wad/parity/frame/frameParity';
import { clearPathTraceCanvas } from '@/wad/renderer/rtgl/pathTraceGpu';
import { LoadedWadData, loadWad } from './loadWad';
import { Thing } from '@/wad/interfaces/Thing';
import { Sector } from '@/wad/interfaces/Sector';
import { getViewAnglesFromViewMatrix, writePlayerViewMatrix, type PlayerViewState } from '@/wad/renderer/controls/playerView';
import { doomPlayerControls, findSectorAt, PlayerSnapshot } from '@/wad/renderer/controls/doomPlayerControls';
import { invalidateBlockingSegmentCache } from '@/wad/renderer/controls/doomCollision';
import { MapActionController, MapActionResult } from '@/wad/game/mapActionController';
import {
  playDoorMotionSound,
  playDoorTriggerSounds,
  playMoverTriggerSounds,
} from '@/wad/game/doorSounds';
import { DoomSfxPlayer } from '@/features/level-viewer/sfx/doomSfxPlayer';
import { refreshDoorWallGeometry } from '@/wad/renderer/geometry/refreshMapGeometry';
import type { RenderBackend } from '@/wad/renderer/renderBackend';
import { backendForMapLoad, readDefaultRenderBackend } from '@/wad/renderer/renderBackend';
import { withTimeout } from '@/utils/promiseTimeout';

const PREWARM_TIMEOUT_MS = 45_000;
import {
  pathTraceNeedsHybridOverlay,
  pathTraceNeedsGpuTrace,
  persistRenderLayerToggles,
  readStoredRenderLayerToggles,
  type RenderLayerToggles,
} from '@/wad/renderer/modular/renderLayerToggles';
import { readRenderModularStageCap, isModularParityMode } from '@/wad/renderer/modular/modularRenderStage';
import { getFederatedRuntime, resetFederatedRuntime, type FederatedSimulationMotion } from '@/wad/federated/GzFederatedRuntime';

let wadData: LoadedWadData | null = null;
let currentMap: WadMap | null = null;
let presentationVisible = false;
let automapActive = false;
let bspDebugActive = false;
let mapActions: MapActionController | null = null;
let liquidWake: { x: number; z: number; strength: number; startedAt: number } | null = null;
let sfxPlayer: DoomSfxPlayer | null = null;
let playerControls: ReturnType<typeof doomPlayerControls> | null = null;
let renderBackend: RenderBackend =
  typeof window !== 'undefined' ? backendForMapLoad(readDefaultRenderBackend()) : 'classic';
let renderLayerToggles: RenderLayerToggles = readStoredRenderLayerToggles();
/** Cap path-trace GPU work (~10 Hz) so the laptop stays responsive. */
const PATH_TRACE_FRAME_INTERVAL_MS = 100;
let lastPathTraceDrawAt = 0;
let currentMapName = '';
let currentWadPath: string | null = null;
let drawPathTraceSyncFn:
  | ((
      params: import('@/wad/renderer/renderGame/drawScene').DrawSceneParams,
      wadPath?: string | null,
      mapName?: string,
      options?: import('@/wad/renderer/rtgl/rtglRenderer').PathTraceDrawOptions
    ) => import('@/wad/renderer/rtgl/rtglRenderer').PathTraceDrawResult)
  | null = null;
let pathTraceModulePromise: Promise<void> | null = null;
let federatedWasmModulePromise: Promise<void> | null = null;
let drawFederatedWasmSyncFn: ((params: import('@/wad/renderer/renderGame/drawScene').DrawSceneParams) => void) | null =
  null;

function ensurePathTraceModule(): Promise<void> {
  if (!pathTraceModulePromise) {
    pathTraceModulePromise = import('@/wad/renderer/rtgl/drawScenePathTrace').then((drawMod) => {
      drawPathTraceSyncFn = drawMod.drawPathTraceSync;
    });
  }
  return pathTraceModulePromise;
}

function ensureFederatedWasmModule(): Promise<void> {
  if (!federatedWasmModulePromise) {
    federatedWasmModulePromise = import('@/wad/renderer/gzrender-v2/federated/drawSceneFederatedWasm').then(
      (mod) => {
        drawFederatedWasmSyncFn = mod.drawFederatedWasmSync;
      },
    );
  }
  return federatedWasmModulePromise;
}

async function prewarmFederatedWasmGeometry(
  wad: Wad,
  mapName: string,
  map: WadMap,
): Promise<void> {
  await ensureFederatedWasmModule();
  await getFederatedRuntime().loadMap(wad, mapName, map);
}

async function prewarmPathTraceGeometry(
  wadPath: string | null,
  mapName: string,
  map: WadMap,
  loaded: LoadedWadData
): Promise<void> {
  await ensurePathTraceModule();
  await import('@/wad/renderer/rtgl/rtglResourceCache').then(({ awaitPathTraceGeometryReady }) =>
    awaitPathTraceGeometryReady(wadPath, mapName, map, loaded.wallTexturesByName, loaded.buffers)
  );
}

function resizeCanvasToParent(canvas: HTMLCanvasElement, onResize: () => void): () => void {
  const parent = canvas.parentElement;
  if (!parent) return () => {};

  const apply = () => {
    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      onResize();
    }
  };

  apply();
  const observer = new ResizeObserver(apply);
  observer.observe(parent);
  window.addEventListener('resize', apply);
  return () => {
    observer.disconnect();
    window.removeEventListener('resize', apply);
  };
}

export const renderGame = (canvas: HTMLCanvasElement) => {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    preserveDrawingBuffer: true,
    alpha: false,
  }) as WebGL2RenderingContext;
  if (!gl) throw new Error('WebGL2 not supported!');

  if (readDefaultRenderBackend() === 'pathtrace') {
    void ensurePathTraceModule();
  }
  if (readDefaultRenderBackend() === 'wasm-federated') {
    void ensureFederatedWasmModule();
  }

  const {
    camera,
    projectionMatrix,
    modelMatrix,
    viewMatrix,
    invViewMatrix,
    modelViewMatrix,
    modelViewProjMatrix,
    resizeScene,
    shaders,
    skyboxBuffers,
  } = setupCamera(gl, canvas);

  const playfieldCamera = createPlayfieldCamera();
  const frameParityMode = readFrameParityModeFromLocation();
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  resizeScene();
  window.addEventListener('resize', resizeScene);

  let animateFlatIndex = 0;
  let animateWallIndex = 0;
  let animateSpriteIndex = 0;
  let time = 0;
  let unbindControls: (() => void) | null = null;
  let unbindResize: (() => void) | null = null;
  let frameRequest: number | null = null;
  let renderedFrameCount = 0;
  let pendingFrameWaiters: Array<() => void> = [];

  const fpsCounter = document.getElementById("fps-counter") as HTMLDivElement | null;
  let lastFrameTime = performance.now();
  const lastRefreshedCeilings = new Map<number, number>();
  let forceDoorGeometryRefresh = false;
  let paritySpawnView: PlayerViewState | null = null;

  const refreshDoorGeometry = () => {
    if (!wadData || !currentMap || !mapActions) return;
    if (!mapActions.isDirty() && !forceDoorGeometryRefresh) return;

    invalidateBlockingSegmentCache();

    const dirtySectors = mapActions.getDirtySectors();
    const switchedLines = mapActions.getSwitchedLineIndices();
    const hasActiveDoors = mapActions.getActiveMoverCount() > 0;
    let shouldUpload = forceDoorGeometryRefresh || hasActiveDoors;

    if (!shouldUpload) {
      for (const sectorIndex of dirtySectors) {
        const ceiling = Math.floor(currentMap.SECTORS[sectorIndex]?.ceilingheight ?? 0);
        if (lastRefreshedCeilings.get(sectorIndex) !== ceiling) {
          lastRefreshedCeilings.set(sectorIndex, ceiling);
          shouldUpload = true;
        }
      }
    } else {
      for (const sectorIndex of dirtySectors) {
        const ceiling = Math.floor(currentMap.SECTORS[sectorIndex]?.ceilingheight ?? 0);
        lastRefreshedCeilings.set(sectorIndex, ceiling);
      }
    }

    forceDoorGeometryRefresh = false;

    if (shouldUpload) {
      refreshDoorWallGeometry(
        gl,
        currentMap,
        wadData.wallTexturesByName,
        wadData.buffers,
        dirtySectors,
        switchedLines.size > 0 ? switchedLines : undefined
      );
    }

    mapActions.clearDirty();
    mapActions.clearSwitchedLines();
  };

  const handleLineAction = (result: MapActionResult) => {
    if (wadData && sfxPlayer) {
      if ('playOpen' in result) {
        playDoorTriggerSounds(wadData.wad, sfxPlayer, result);
      } else {
        playMoverTriggerSounds(wadData.wad, sfxPlayer, result);
      }
    }
    if (result.triggered) {
      forceDoorGeometryRefresh = true;
      invalidateBlockingSegmentCache();
    }
  };

  const notifyRenderedFrame = () => {
    renderedFrameCount += 1;
    if (pendingFrameWaiters.length === 0) return;
    const waiters = pendingFrameWaiters;
    pendingFrameWaiters = [];
    for (const resolve of waiters) resolve();
  };

  const waitForRenderedFrame = (): Promise<void> => {
    const target = renderedFrameCount + 1;
    if (renderedFrameCount >= target) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      pendingFrameWaiters.push(() => {
        if (renderedFrameCount >= target) {
          resolve();
          return;
        }
        waitForRenderedFrame().then(resolve);
      });
    });
  };

  const setPresentationVisible = (visible: boolean) => {
    presentationVisible = visible;
  };

  const setAutomapActive = (active: boolean) => {
    automapActive = active;
    if (active && document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
  };

  const setBspDebugActive = (active: boolean) => {
    bspDebugActive = active;
    if (active && document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
  };

  const getPlayerState = (): PlayerSnapshot | null => playerControls?.getPlayerState() ?? null;

  const getBspTraceYaw = (): number =>
    getViewAnglesFromViewMatrix(viewMatrix).yaw;

  unbindResize = resizeCanvasToParent(canvas, resizeScene);

  const load = (
    wad: Wad,
    map: WadMap,
    mapName: string,
    wadPath?: string | null,
    modPaths: readonly string[] = [],
  ): Promise<void> => {
    if (!frameParityMode) {
      presentationVisible = false;
    }
    currentMapName = mapName;
    currentWadPath = wadPath ?? null;
    const gameMap = structuredClone(map);
    return loadWad(gl, wad, gameMap, mapName, wadPath, modPaths, {
      useIndexTextures: frameParityMode,
    }).then(async (loaded) => {
      wadData = loaded;
      currentMap = gameMap;
      mapActions = new MapActionController(gameMap);
      liquidWake = null;
      lastRefreshedCeilings.clear();
      forceDoorGeometryRefresh = false;
      sfxPlayer = sfxPlayer ?? new DoomSfxPlayer();

      let loadBackend = backendForMapLoad(renderBackend);

      if (loadBackend === 'pathtrace') {
        try {
          await withTimeout(
            prewarmPathTraceGeometry(wadPath ?? null, mapName, gameMap, loaded),
            PREWARM_TIMEOUT_MS,
            'Path trace prewarm',
          );
        } catch (error) {
          console.warn('[render] pathtrace prewarm failed; falling back to classic draw:', error);
          loadBackend = 'classic';
          renderBackend = 'classic';
        }
      }

      if (loadBackend === 'wasm-federated') {
        try {
          await withTimeout(
            prewarmFederatedWasmGeometry(wad, mapName, gameMap),
            PREWARM_TIMEOUT_MS,
            'Federated WASM prewarm',
          );
        } catch (error) {
          console.warn('[render] federated WASM prewarm failed; falling back to classic draw:', error);
          loadBackend = 'classic';
          renderBackend = 'classic';
        }
      }

      const { playerStart, playerZ, cameraAngle } = wadData;
      const startSector = findSectorAt(gameMap, loaded.buffers, playerStart);
      paritySpawnView = frameParityMode
        ? {
            x: playerStart.x,
            y: playerStart.y,
            yaw: cameraAngle,
            pitch: 0,
            worldFeetZ: startSector?.floorheight ?? playerZ,
            sector: startSector,
          }
        : null;
      writePlayerViewMatrix(viewMatrix, paritySpawnView ?? {
        x: playerStart.x,
        y: playerStart.y,
        yaw: cameraAngle,
        pitch: 0,
        worldFeetZ: startSector?.floorheight ?? playerZ,
        sector: startSector,
      });
      const spawnInv = mat4.invert(mat4.create(), viewMatrix)!;
      vec3.set(camera.pos, spawnInv[12], spawnInv[13], spawnInv[14]);

      unbindControls?.();
      if (!frameParityMode) {
        playerControls = doomPlayerControls({
          canvas,
          viewMatrix,
          map: gameMap,
          buffers: wadData.buffers,
          start: { x: playerStart.x, y: playerStart.y, angle: cameraAngle },
          isAutomapActive: () => automapActive,
          onLiquidTransition: (event) => {
            if (event.kind === 'enter') {
              liquidWake = {
                x: event.worldX,
                z: event.worldZ,
                strength: 1,
                startedAt: performance.now(),
              };
            }
          },
          mapActions,
          onLineAction: handleLineAction,
        });
        unbindControls = playerControls.unbind;
      } else {
        playerControls = null;
        unbindControls = null;
      }

      lastFrameTime = performance.now();
      if (frameParityMode) {
        presentationVisible = true;
      }
      if (frameRequest === null) {
        frameRequest = requestAnimationFrame(renderFrame);
      }
    });
  };

  function renderFrame() {
    frameRequest = requestAnimationFrame(renderFrame);
    const now = performance.now();
    const dt = now - lastFrameTime;
    lastFrameTime = now;

    time += dt;
    animateFlatIndex = Math.floor(time / (1000 / animatedFlatFps));
    animateWallIndex = Math.floor(time / (1000 / animatedWallFps));
    animateSpriteIndex = Math.floor(time / (1000 / animatedSpriteFps));

    if (paritySpawnView) {
      writePlayerViewMatrix(viewMatrix, paritySpawnView);
    }

    updateCameraFromViewMatrix(viewMatrix, invViewMatrix, camera);

    mat4.identity(modelMatrix);
    const layout = resolvePlayfieldLayout(gl.canvas.width, gl.canvas.height, frameParityMode);
    const parityFov = frameParityMode
      ? doomVerticalFovDegrees(layout.width, layout.height)
      : camera.fov;
    updatePlayfieldCamera(
      playfieldCamera,
      gl.canvas.width,
      gl.canvas.height,
      parityFov,
      camera.near,
      camera.far,
      viewMatrix,
      modelMatrix,
      layout,
    );

    if (presentationVisible && wadData && currentMap && mapActions && !frameParityMode) {
      const dtSeconds = Math.min(dt / 1000, 0.05);
      let motion: FederatedSimulationMotion = {
        playOpen: false,
        playClose: false,
        playStart: false,
        sound: 'door',
      };

      if (renderBackend === 'wasm-federated' && getFederatedRuntime().isLoaded()) {
        const sim = getFederatedRuntime().advanceFrame(dtSeconds, mapActions, currentMap);
        motion = sim.motion;
      } else {
        motion = mapActions.tick(dtSeconds);
      }

      if (motion.playOpen || motion.playClose) {
        playDoorMotionSound(
          wadData.wad,
          sfxPlayer!,
          motion.sound === 'blaze' ? 'blaze' : 'door',
          motion.playOpen ? 'open' : 'close'
        );
      }
      if (motion.playStart) {
        playMoverTriggerSounds(wadData.wad, sfxPlayer!, {
          triggered: true,
          playSwitch: false,
          playStart: true,
          sound: motion.sound === 'lift' ? 'lift' : 'mover',
        });
      }
      if (mapActions.isDirty() || forceDoorGeometryRefresh) {
        refreshDoorGeometry();
      } else if (mapActions.getActiveMoverCount() > 0) {
        invalidateBlockingSegmentCache();
      }
    }

    if (liquidWake) {
      const age = (performance.now() - liquidWake.startedAt) / 1000;
      if (age > 2.5) {
        liquidWake = null;
      } else {
        liquidWake.strength = Math.max(0, 1 - age / 2.5);
      }
    }

    if ((presentationVisible || frameParityMode) && wadData && currentMap && mapActions && !automapActive) {
      const start = performance.now();
      const player = getPlayerState();

      const sceneParams = {
          gl,
          shaders,
          projectionMatrix: playfieldCamera.projectionMatrix,
          modelMatrix,
          viewMatrix,
          modelViewMatrix: playfieldCamera.modelViewMatrix,
          modelViewProjMatrix: playfieldCamera.modelViewProjMatrix,
          invViewProjMatrix: playfieldCamera.invViewProjMatrix,
          playfieldLayout: playfieldCamera.layout,
          cameraFov: camera.fov,
          canvasAspect: gl.canvas.width / Math.max(1, gl.canvas.height),
          cameraPos: camera.pos as [number, number, number],
          textures: wadData.textures,
          currentSky: wadData.currentSky,
          buffers: wadData.buffers,
          skyboxBuffers,
          wad: wadData.wad,
          map: currentMap,
          wadAssets: wadData.wadAssets,
          sortedFramesByThingName: wadData.sortedFramesByThingName,
          animateFlatIndex,
          animateWallIndex,
          animateSpriteIndex,
          timeSeconds: time / 1000,
          renderableThings: wadData.renderableThings,
          voxelThingFrames: wadData.voxelThingFrames,
          voxelCatalog: wadData.voxelCatalog,
          pointLights: wadData.pointLights,
          wallTexturesByName: wadData.wallTexturesByName,
          floorTextureColors: wadData.floorTextureColors,
          wallTextureColors: wadData.wallTextureColors,
          renderBackend,
          wadPath: currentWadPath,
          mapName: currentMapName,
          liquidWake: liquidWake
            ? {
                x: liquidWake.x,
                z: liquidWake.z,
                strength: liquidWake.strength,
                ageSeconds: (performance.now() - liquidWake.startedAt) / 1000,
              }
            : null,
          renderLayerToggles,
          frameParityMode,
          colormapLut: wadData.colormapLut ?? null,
      };

      const modularStageCap = readRenderModularStageCap();
      const sceneParamsWithModular = {
        ...sceneParams,
        modularStageCap,
        stageSnapshotRecorder:
          isModularParityMode() || modularStageCap != null
            ? new StageSnapshotRecorder(renderBackend, currentMapName, modularStageCap)
            : undefined,
      };

      if (renderBackend === 'pathtrace') {
        const needsGpu = pathTraceNeedsGpuTrace(renderLayerToggles);
        const needsOverlay = pathTraceNeedsHybridOverlay(renderLayerToggles);

        if (!needsGpu) {
          resizeScene();
          clearPathTraceLetterbox(gl);
        } else {
          const traceNow = performance.now();
          const traceDue = traceNow - lastPathTraceDrawAt >= PATH_TRACE_FRAME_INTERVAL_MS;
          if (traceDue) {
            lastPathTraceDrawAt = traceNow;
            resizeScene();
            clearPathTraceLetterbox(gl);

            if (drawPathTraceSyncFn) {
              const ptResult = drawPathTraceSyncFn(
                {
                  ...sceneParams,
                  wadPath: currentWadPath,
                  mapName: currentMapName,
                },
                currentWadPath,
                currentMapName,
                { keySky: false, preserveLetterbox: true }
              );
              if (ptResult.status === 'failed') {
                clearPathTraceCanvas(gl);
              }
            } else {
              clearPathTraceCanvas(gl);
              void ensurePathTraceModule();
            }
          }
        }

        if (needsOverlay) {
          drawScene({
            ...sceneParamsWithModular,
            pathTraceOverlay: true,
            skipPlayfieldClear: true,
          });
        }
      } else if (renderBackend === 'wasm-federated') {
        if (drawFederatedWasmSyncFn) {
          drawFederatedWasmSyncFn(sceneParamsWithModular);
        } else {
          void ensureFederatedWasmModule();
          drawScene(sceneParamsWithModular);
        }
      } else {
        drawScene(sceneParamsWithModular);
      }
      notifyRenderedFrame();

      const end = performance.now();
      const drawTime = end - start;
      const fps = Math.round(1000 / dt);

      if (fpsCounter) {
        const tag =
          renderBackend === 'pathtrace' ? ' · PT' : renderBackend === 'wasm-federated' ? ' · WASM' : '';
        fpsCounter.textContent = `FPS: ${fps} (${drawTime.toFixed(2)} ms)${tag}`;
      }
    }
  }

  const setRenderBackend = (backend: RenderBackend) => {
    renderBackend = backendForMapLoad(backend);
    lastPathTraceDrawAt = 0;
    if (backend === 'pathtrace') {
      void ensurePathTraceModule();
      void import('@/wad/renderer/rtgl/rtglRenderer').then(({ resetPathTraceGpu }) => resetPathTraceGpu());
      if (wadData && currentMap) {
        void prewarmPathTraceGeometry(
          currentWadPath,
          currentMapName,
          currentMap,
          wadData
        );
      }
    } else if (backend === 'wasm-federated') {
      void ensureFederatedWasmModule();
      void import('@/wad/renderer/gzrender-v2/federated/loadFederatedWasmBackend').then(({ loadFederatedWasmBackend }) =>
        loadFederatedWasmBackend(),
      );
      if (wadData && currentMap) {
        void prewarmFederatedWasmGeometry(wadData.wad, currentMapName, currentMap);
      }
    } else {
      void import('@/wad/renderer/rtgl/rtglRenderer').then(({ resetPathTraceGpu }) => resetPathTraceGpu());
    }
  };

  const getPathTraceDebugInfo = () => {
    if (renderBackend !== 'pathtrace') return null;
    return import('@/wad/renderer/rtgl/rtglRenderer')
      .then(({ getPathTraceDebugInfo: read }) => read())
      .catch(() => null);
  };

  const getFederatedWasmDebugInfo = () => {
    if (renderBackend !== 'wasm-federated') return null;
    return Promise.resolve(getFederatedRuntime().getDebugInfo());
  };

  const setRenderLayerToggles = (toggles: RenderLayerToggles) => {
    renderLayerToggles = toggles;
    persistRenderLayerToggles(toggles);
    if (renderBackend === 'pathtrace') {
      lastPathTraceDrawAt = 0;
      void import('@/wad/renderer/rtgl/rtglRenderer').then(({ resetPathTraceGpu }) => resetPathTraceGpu());
    }
  };

  const getRenderLayerToggles = () => renderLayerToggles;

  return {
    load,
    setPresentationVisible,
    setAutomapActive,
    setBspDebugActive,
    setRenderBackend,
    setRenderLayerToggles,
    getRenderLayerToggles,
    getPlayerState,
    getBspTraceYaw,
    waitForRenderedFrame,
    getPathTraceDebugInfo,
    getFederatedWasmDebugInfo,
  };
};
